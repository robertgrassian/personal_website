"""Business logic for the authenticated /me endpoints.

Onboarding is the "authenticated but no profile yet" transition: OAuth/magic-
link creates the auth.users row, then the user picks a username and this
service creates the matching profiles row (id == auth id).

Domain exceptions (no HTTP knowledge) that the router maps to status codes:
``ProfileExistsError`` (already onboarded), ``UsernameError`` (format /
reserved / taken), ``SignupCapReachedError`` (signup cap). Same not-found-as-
exception style as services/users.py.
"""

import re

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser
from app.core.config import get_settings
from app.core.supabase_admin import delete_auth_user
from app.models import Profile
from app.repositories import me as me_repo
from app.repositories import users as users_repo
from app.schemas.me import GameUpdate, MyProfileRead, ProfileCreate, SessionClose, SessionCreate
from app.schemas.users import GameRead
from app.services.users import derive_play_state, to_game_read

# Mirrors the DB CHECK on profiles.username (app/models/profile.py): starts
# with a lowercase letter or digit, then [a-z0-9_-], 3-30 chars total. Kept in
# sync deliberately — the app validates for a friendly message, the DB
# backstops. Input is lowercased before this runs, so the class is safe.
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,29}$")

# Reserved handles rejected regardless of format. Two categories:
#   1. API-colliding tokens — /users/{username} shares its namespace with
#      /users/search and the /me alias, so those MUST be reserved.
#   2. Route/branding/abuse names that shouldn't become public library URLs.
RESERVED_USERNAMES = frozenset(
    {
        # API/route collisions
        "me",
        "search",
        "users",
        "user",
        "api",
        "library",
        "login",
        "logout",
        "signup",
        "signin",
        "auth",
        "onboarding",
        "u",
        # site sections (would shadow real routes / confuse)
        "about",
        "resume",
        "video_games",
        "admin",
        "settings",
        "account",
        # branding / impersonation
        "rgrassian",  # the founder handle (seeded); un-claimable by others
        "robert",  # kept reserved too (former founder-handle candidate)
        "grassian",
        "official",
        "support",
        "help",
        "root",
        "null",
        "undefined",
    }
)


class ProfileExistsError(Exception):
    """The caller already has a profile — onboarding is a one-time action."""


class UsernameError(Exception):
    """Username rejected: bad format, reserved, or already taken. Carries a
    machine-readable ``reason`` so the router/FE can branch without parsing
    the message."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason  # "format" | "reserved" | "taken"


class SignupCapReachedError(Exception):
    """MAX_USERS reached — signup is closed."""


class GameNotFoundError(Exception):
    """No such game in the caller's library. Deliberately covers both "id
    doesn't exist" and "id belongs to someone else" — /me/* treats the
    caller's library as the entire namespace, so foreign rows are simply
    not found (404), never revealed as forbidden (403)."""

    def __init__(self, game_id: int) -> None:
        super().__init__(f"Game {game_id} not found in your library")


class SessionNotFoundError(Exception):
    """No such session under the caller's games — same 404-over-403 policy as
    GameNotFoundError: foreign and nonexistent ids are indistinguishable."""

    def __init__(self, session_id: int) -> None:
        super().__init__(f"Session {session_id} not found in your library")


class AlreadyPlayingError(Exception):
    """Tried to open a session on a game that already has one. Mirrors the
    old session skill's "already_playing" answer; the message carries the
    existing start date so the UI can say since when."""

    def __init__(self, game_name: str, since: str) -> None:
        super().__init__(f"{game_name} is already being played (since {since}).")


class SessionAlreadyClosedError(Exception):
    """Tried to close a session that already has an end date."""

    def __init__(self, session_id: int) -> None:
        super().__init__(f"Session {session_id} is already closed.")


class SessionDatesError(Exception):
    """Close date precedes the session's start date — invalid input, not a
    conflict, so the router maps it to a 422."""


def get_my_profile(db: Session, user: AuthenticatedUser) -> MyProfileRead | None:
    """The caller's profile, or None when onboarding isn't complete. The
    router turns None into a 404 the FE reads as "go to onboarding"."""
    profile = me_repo.get_profile_by_id(db, user.id)
    if profile is None:
        return None
    return MyProfileRead(username=profile.username, display_name=profile.display_name)


def _validate_username(username: str) -> str:
    """Normalize and validate, or raise UsernameError. Returns the canonical
    (lowercased, trimmed) username to store."""
    normalized = username.strip().lower()
    if not USERNAME_RE.match(normalized):
        raise UsernameError(
            "format",
            "Username must be 3-30 characters, start with a letter or number, "
            "and use only lowercase letters, numbers, hyphens, and underscores.",
        )
    if normalized in RESERVED_USERNAMES:
        raise UsernameError("reserved", f"The username '{normalized}' is reserved.")
    return normalized


def create_my_profile(
    db: Session, user: AuthenticatedUser, payload: ProfileCreate
) -> MyProfileRead:
    """Complete onboarding: create the caller's profile row.

    Order of checks is deliberate:
    1. Already onboarded → ProfileExistsError (idempotency guard; never a
       second profile for one auth user).
    2. Username format / reserved → UsernameError before touching the DB.
    3. Signup cap → SignupCapReachedError. Because OAuth already minted this
       auth user, an over-cap signup leaves an orphan consuming a monthly-
       active-user slot; we delete it via the Admin API before raising so
       counts stay honest.
    4. Taken → UsernameError("taken"). The explicit check gives a clean 409 in
       the common case; the DB unique index is the real backstop for the race
       between the check and the commit (handled below).
    """
    if me_repo.get_profile_by_id(db, user.id) is not None:
        raise ProfileExistsError("Profile already exists for this account.")

    username = _validate_username(payload.username)

    settings = get_settings()
    # TOCTOU note: this count-then-insert can overshoot MAX_USERS if several
    # signups race at the boundary (serverless functions are stateless — no
    # shared in-process counter). Accepted for a personal-scale cap: the blast
    # radius is "a few users over 100", not a correctness or security problem,
    # and a DB-level guard on a COUNT isn't worth the complexity.
    if me_repo.count_profiles(db) >= settings.max_users:
        # Clean up the orphaned auth user before refusing (best-effort; the
        # admin client logs and returns False if unconfigured).
        delete_auth_user(user.id)
        raise SignupCapReachedError(
            "Signups are currently at capacity. Please check back later."
        )

    if me_repo.username_exists(db, username):
        raise UsernameError("taken", f"The username '{username}' is already taken.")

    display_name = payload.display_name.strip() or username
    try:
        profile: Profile = me_repo.create_profile(
            db, user_id=user.id, username=username, display_name=display_name
        )
    except IntegrityError as exc:
        # A concurrent onboarding POST committed between our checks above and
        # this insert, violating either the username unique index or the
        # profiles PK. Roll back the poisoned transaction, then re-derive which
        # collision it was so the caller still gets the intended 409 (not a
        # 500): if this user now has a profile, it was a double-submit; else
        # someone else took the handle first.
        db.rollback()
        if me_repo.get_profile_by_id(db, user.id) is not None:
            raise ProfileExistsError("Profile already exists for this account.") from exc
        raise UsernameError(
            "taken", f"The username '{username}' is already taken."
        ) from exc
    return MyProfileRead(username=profile.username, display_name=profile.display_name)


def update_my_game(
    db: Session, user: AuthenticatedUser, game_id: int, payload: GameUpdate
) -> GameRead:
    """Apply a partial edit to one of the caller's games and return the full
    updated game (same wire shape as the public reads, play state included, so
    the client can reconcile without a second fetch)."""
    game = me_repo.get_game_for_owner(db, game_id, user.id)
    if game is None:
        raise GameNotFoundError(game_id)

    # model_fields_set = fields present in the request body — PATCH semantics.
    # An omitted rating leaves the row untouched; "" (or null) clears to
    # unrated, stored as NULL per the schema convention.
    if "rating" in payload.model_fields_set:
        game = me_repo.update_game_rating(db, game, payload.rating or None)

    return _game_read_with_fresh_state(db, game)


def _game_read_with_fresh_state(db: Session, game) -> GameRead:
    """Re-derive play state from all of the game's sessions after a mutation —
    the wire shape every session write returns, so the client reconciles
    without a second fetch."""
    sessions = users_repo.list_play_sessions(db, [game.id])
    return to_game_read(game, derive_play_state(sessions))


def create_my_session(
    db: Session, user: AuthenticatedUser, game_id: int, payload: SessionCreate
) -> GameRead:
    """Start playing (no endDate → open session) or log a past playthrough
    (both dates). Only one open session per game: opening a second is a
    conflict, matching the old session skill; logging closed past sessions is
    always allowed, even while the game is being played."""
    game = me_repo.get_game_for_owner(db, game_id, user.id)
    if game is None:
        raise GameNotFoundError(game_id)

    if payload.end_date is None:
        existing = me_repo.get_open_session_for_game(db, game.id)
        if existing is not None:
            raise AlreadyPlayingError(game.name, existing.start_date.isoformat())

    me_repo.create_session(db, game.id, payload.start_date, payload.end_date)
    return _game_read_with_fresh_state(db, game)


def close_my_session(
    db: Session, user: AuthenticatedUser, session_id: int, payload: SessionClose
) -> GameRead:
    """Stop playing: set the session's end date, optionally rating the game in
    the same transaction (rate-on-stop). Rating follows PATCH semantics —
    omitted leaves it alone, ""/null clears to unrated."""
    play_session = me_repo.get_session_for_owner(db, session_id, user.id)
    if play_session is None:
        raise SessionNotFoundError(session_id)
    if play_session.end_date is not None:
        raise SessionAlreadyClosedError(session_id)
    if payload.end_date < play_session.start_date:
        raise SessionDatesError(
            f"endDate must not be before the session's start date "
            f"({play_session.start_date.isoformat()})."
        )

    # Ownership was proven by the session lookup; this fetch just materializes
    # the game row for the rating write and the response payload.
    game = me_repo.get_game_for_owner(db, play_session.game_id, user.id)
    rate = "rating" in payload.model_fields_set
    me_repo.finish_session(
        db,
        play_session,
        payload.end_date,
        rated_game=game if rate else None,
        rating=payload.rating or None,
    )
    return _game_read_with_fresh_state(db, game)
