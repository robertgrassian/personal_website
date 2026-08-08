"""Business logic for the authenticated /me endpoints.

Onboarding is the "authenticated but no profile yet" transition: OAuth/magic-
link creates the auth.users row, then the user picks a username and this
service creates the matching profiles row (id == auth id).

Domain exceptions (no HTTP knowledge) that the router maps to status codes:
``ProfileExistsError`` (already onboarded), ``UsernameError`` (format /
reserved / taken), ``SignupCapReachedError`` (signup cap). Same not-found-as-
exception style as services/users.py.
"""

import logging
import re
import uuid

from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser
from app.core.config import FOUNDER_USERNAME, get_settings
from app.core.errors import DomainError
from app.core.supabase_admin import delete_auth_user, delete_auth_user_or_raise
from app.models import Profile
from app.repositories import me as me_repo
from app.repositories import rate_limit as rate_limit_repo
from app.repositories import users as users_repo
from app.schemas.me import (
    GameCreate,
    GameUpdate,
    MyProfileRead,
    ProfileCreate,
    SessionClose,
    SessionCreate,
    WishlistCreate,
    WishlistPromote,
    WishlistUpdate,
)
from app.schemas.users import GameRead, WishlistGameRead
from app.services.users import derive_play_state, to_game_read, to_wishlist_read

# Mirrors the DB CHECK on profiles.username (app/models/profile.py): starts
# with a lowercase letter or digit, then [a-z0-9_-], 3-30 chars total. Kept in
# sync deliberately — the app validates for a friendly message, the DB
# backstops. Input is lowercased before this runs, so the class is safe.
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,29}$")

logger = logging.getLogger(__name__)


def _both_spellings(names: set[str]) -> set[str]:
    """Every name in the set, in both its snake_case and kebab-case spelling.

    USERNAME_RE accepts ``_`` and ``-`` alike, so a name reserved in one
    spelling stays claimable in the other. Listing both by hand only works
    while someone remembers to; deriving them means a name added in either
    spelling is reserved in both. Names without a separator pass through
    unchanged.
    """
    return {n.replace("_", "-") for n in names} | {n.replace("-", "_") for n in names}


# Reserved handles rejected regardless of format. Two categories:
#   1. API-colliding tokens — /users/{username} shares its namespace with
#      /users/search and the /me alias, so those MUST be reserved.
#   2. Route/branding/abuse names that shouldn't become public library URLs.
#
# Category 1 is now defensive rather than load-bearing on the web side, since
# usernames appear only under /video-games/u/, where they cannot shadow a site
# route at any depth. It still matters for the API's own /users namespace.
#
# Write each name once, in the spelling the route actually uses;
# _both_spellings() covers the other. Reserving only "video_games" is what
# left "video-games" claimable after the kebab-case route rename.
RESERVED_USERNAMES = frozenset(
    _both_spellings(
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
            "video-games",
            "currently-playing",
            "privacy",
            "start",
            "admin",
            "settings",
            "account",
            # branding / impersonation
            # The founder handle (seeded), derived rather than re-typed: as a
            # literal, renaming FOUNDER_USERNAME would un-reserve the handle
            # signup had just created.
            FOUNDER_USERNAME,
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
)


class ProfileExistsError(DomainError):
    """The caller already has a profile — onboarding is a one-time action."""

    status_code = status.HTTP_409_CONFLICT


class UsernameError(DomainError):
    """Username rejected: bad format, reserved, or already taken. Carries a
    machine-readable ``reason`` so the FE can branch without parsing the
    message.

    The one domain error whose status depends on the instance rather than the
    class: a taken name is a conflict, while a malformed or reserved one is
    unprocessable input. Set here so the decision travels with the error
    instead of being re-derived by whichever route raised it."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason  # "format" | "reserved" | "taken"
        self.status_code = (
            status.HTTP_409_CONFLICT if reason == "taken" else status.HTTP_422_UNPROCESSABLE_CONTENT
        )


class SignupCapReachedError(DomainError):
    """MAX_USERS reached — signup is closed."""

    status_code = status.HTTP_403_FORBIDDEN


class LibraryFullError(DomainError):
    """MAX_GAMES reached — this library can't take another game."""

    status_code = status.HTTP_403_FORBIDDEN

    def __init__(self, limit: int) -> None:
        super().__init__(
            f"Library is full — {limit} games is the maximum. Remove something before adding more."
        )


class GameNotFoundError(DomainError):
    """No such game in the caller's library. Deliberately covers both "id
    doesn't exist" and "id belongs to someone else" — /me/* treats the
    caller's library as the entire namespace, so foreign rows are simply
    not found (404), never revealed as forbidden (403)."""

    status_code = status.HTTP_404_NOT_FOUND

    def __init__(self, game_id: int) -> None:
        super().__init__(f"Game {game_id} not found in your library")


class GameExistsError(DomainError):
    """The caller's library already has this (name, system) combination."""

    status_code = status.HTTP_409_CONFLICT

    def __init__(self, name: str, system: str) -> None:
        super().__init__(f"{name} ({system}) is already in your library.")


class OnboardingRequiredError(DomainError):
    """Authenticated but no profile row yet. Several tables reference profiles
    (games.user_id, follows.follower_id), so writing any of them before
    onboarding is an FK violation. The explicit check turns what would be a 500
    — misread as a duplicate by the IntegrityError backstop — into a clear 403.

    ``action`` names what was attempted, so a follow is not told to complete
    onboarding "before adding games"."""

    status_code = status.HTTP_403_FORBIDDEN

    def __init__(self, action: str = "doing that") -> None:
        super().__init__(f"Complete onboarding before {action}.")


class WishlistItemExistsError(DomainError):
    """The caller's wishlist already has this name (dedupe is by name alone)."""

    status_code = status.HTTP_409_CONFLICT

    def __init__(self, name: str) -> None:
        super().__init__(f"{name} is already on your wishlist.")


class WishlistItemNotFoundError(DomainError):
    """No such wishlist item in the caller's list — 404-over-403, as usual."""

    status_code = status.HTTP_404_NOT_FOUND

    def __init__(self, item_id: int) -> None:
        super().__init__(f"Wishlist item {item_id} not found.")


class SystemRequiredError(DomainError):
    """Promoting needs a system (games.system is NOT NULL) and neither the
    wishlist row nor the request supplied one — invalid input, so 422."""

    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT

    def __init__(self) -> None:
        super().__init__("Pick a system to add this game to the library.")


class SessionNotFoundError(DomainError):
    """No such session under the caller's games — same 404-over-403 policy as
    GameNotFoundError: foreign and nonexistent ids are indistinguishable."""

    status_code = status.HTTP_404_NOT_FOUND

    def __init__(self, session_id: int) -> None:
        super().__init__(f"Session {session_id} not found in your library")


class AlreadyPlayingError(DomainError):
    """Tried to open a session on a game that already has one. Mirrors the
    old session skill's "already_playing" answer; the message carries the
    existing start date so the UI can say since when."""

    status_code = status.HTTP_409_CONFLICT

    def __init__(self, game_name: str, since: str) -> None:
        super().__init__(f"{game_name} is already being played (since {since}).")


class SessionAlreadyClosedError(DomainError):
    """Tried to close a session that already has an end date."""

    status_code = status.HTTP_409_CONFLICT

    def __init__(self, session_id: int) -> None:
        super().__init__(f"Session {session_id} is already closed.")


class SessionDatesError(DomainError):
    """Close date precedes the session's start date — invalid input, not a
    conflict, so the router maps it to a 422."""

    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


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


def _resolve_founder_id(db: Session, configured_username: str | None) -> uuid.UUID | None:
    """The founder's profile id to auto-follow, or None to skip auto-follow.

    Resolving through the username is also what verifies the founder exists.
    Without that check, a founder handle with no profile row (a bare local DB,
    CI, a future rename) would make the follow edges violate their foreign key,
    rolling back the profile insert with them — every signup would fail, and the
    IntegrityError handling below would misreport it as "username taken".
    Auto-follow is a nicety; it must never be able to close signup.
    """
    if not configured_username:
        return None
    founder = users_repo.get_profile_by_username(db, configured_username)
    if founder is None:
        logger.warning("Founder %r has no profile row; skipping auto-follow.", configured_username)
        return None
    return founder.id


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
        # admin client logs and returns if unconfigured or if the call fails).
        delete_auth_user(user.id)
        raise SignupCapReachedError("Signups are currently at capacity. Please check back later.")

    if me_repo.username_exists(db, username):
        raise UsernameError("taken", f"The username '{username}' is already taken.")

    display_name = payload.display_name.strip() or username
    try:
        profile: Profile = me_repo.create_profile_with_follows(
            db,
            user_id=user.id,
            username=username,
            display_name=display_name,
            founder_id=_resolve_founder_id(db, FOUNDER_USERNAME),
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
        raise UsernameError("taken", f"The username '{username}' is already taken.") from exc
    return MyProfileRead(username=profile.username, display_name=profile.display_name)


def delete_my_account(db: Session, user: AuthenticatedUser) -> None:
    """Delete the caller's account and everything belonging to it.

    The auth.users row is the root of the cascade, not the profile: profiles.id
    references auth.users(id) ON DELETE CASCADE, and games / wishlist_items /
    both directions of follows cascade from profiles (play_sessions from
    games). So this cannot be a ``db.delete(profile)`` — the cascade runs the
    other way, and deleting the profile locally would leave the auth user able
    to sign back in to a half-deleted account.

    Order is deliberate. The Admin API call goes first, so a failure there
    (503) leaves the account entirely intact rather than partly dismantled.
    Only once it has succeeded do the rate-limit counters get cleared, which is
    also why that step cannot be a route dependency: rate_limit_writes in
    WRITE_GUARDS inserts a row for this user on the way in, and a dependency
    could not be ordered after it.

    No OnboardingRequiredError: an authenticated user with no profile row is a
    real, deletable account (OAuth mints the auth user before onboarding runs),
    and it is the state that most deserves a working delete. Nothing here reads
    the profile, so the no-profile case needs no special path.
    """
    delete_auth_user_or_raise(user.id)
    rate_limit_repo.delete_for_user(db, user.id)
    logger.info("Deleted account %s", user.id)


def create_my_game(db: Session, user: AuthenticatedUser, payload: GameCreate) -> GameRead:
    """Add a game to the caller's library. Duplicate (name, system) is a
    conflict: the explicit check gives the friendly message in the common
    case, the uq_games_user_id_name_system constraint is the real backstop
    for a concurrent double-submit (same pattern as onboarding)."""
    if me_repo.get_profile_by_id(db, user.id) is None:
        raise OnboardingRequiredError("adding games")
    # Checked before the duplicate lookup so a full library says so plainly
    # rather than reporting whichever problem happens to be found first. Same
    # count-then-insert race as the signup cap: a burst of concurrent adds can
    # overshoot by a few. Accepted — this bounds abuse, it isn't an invariant.
    limit = get_settings().max_games
    if me_repo.count_games(db, user.id) >= limit:
        raise LibraryFullError(limit)
    if me_repo.find_game_by_name_and_system(db, user.id, payload.name, payload.system):
        raise GameExistsError(payload.name, payload.system)

    try:
        game = me_repo.create_game(
            db,
            user_id=user.id,
            name=payload.name,
            system=payload.system,
            genres=payload.genres,
            release_date=payload.release_date,
            image_url=payload.image_url or None,
            igdb_id=payload.igdb_id,
            rating=payload.rating or None,
        )
    except IntegrityError as exc:
        db.rollback()
        raise GameExistsError(payload.name, payload.system) from exc
    # A brand-new game has no sessions; skip the session query.
    return to_game_read(game, derive_play_state([]))


def delete_my_game(db: Session, user: AuthenticatedUser, game_id: int) -> None:
    """Remove a game (and, via ON DELETE CASCADE, its play sessions) from the
    caller's library. Same 404-over-403 policy as every /me lookup."""
    game = me_repo.get_game_for_owner(db, game_id, user.id)
    if game is None:
        raise GameNotFoundError(game_id)
    me_repo.delete_game(db, game)


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


def create_my_wishlist_item(
    db: Session, user: AuthenticatedUser, payload: WishlistCreate
) -> WishlistGameRead:
    """Add a wishlist entry. Same shape of checks as create_my_game: profile
    first (FK), then a friendly name-dedupe 409 with the unique constraint as
    the concurrency backstop."""
    if me_repo.get_profile_by_id(db, user.id) is None:
        raise OnboardingRequiredError("using your wishlist")
    if me_repo.find_wishlist_item_by_name(db, user.id, payload.name):
        raise WishlistItemExistsError(payload.name)

    try:
        item = me_repo.create_wishlist_item(
            db,
            user_id=user.id,
            name=payload.name,
            system=payload.system or None,
            genres=payload.genres,
            release_date=payload.release_date,
            image_url=payload.image_url or None,
            igdb_id=payload.igdb_id,
            starred=payload.starred,
            notes=payload.notes,
            date_added=payload.date_added,
        )
    except IntegrityError as exc:
        db.rollback()
        raise WishlistItemExistsError(payload.name) from exc
    return to_wishlist_read(item)


def update_my_wishlist_item(
    db: Session, user: AuthenticatedUser, item_id: int, payload: WishlistUpdate
) -> WishlistGameRead:
    """Partial edit (starred / notes / system) with the same model_fields_set
    PATCH semantics as GameUpdate. system "" clears to undecided (NULL)."""
    item = me_repo.get_wishlist_item_for_owner(db, item_id, user.id)
    if item is None:
        raise WishlistItemNotFoundError(item_id)

    if "starred" in payload.model_fields_set and payload.starred is not None:
        item.starred = payload.starred
    if "notes" in payload.model_fields_set and payload.notes is not None:
        item.notes = payload.notes
    if "system" in payload.model_fields_set and payload.system is not None:
        item.system = payload.system.strip() or None
    item = me_repo.update_wishlist_item(db, item)
    return to_wishlist_read(item)


def delete_my_wishlist_item(db: Session, user: AuthenticatedUser, item_id: int) -> None:
    item = me_repo.get_wishlist_item_for_owner(db, item_id, user.id)
    if item is None:
        raise WishlistItemNotFoundError(item_id)
    me_repo.delete_wishlist_item(db, item)


def promote_my_wishlist_item(
    db: Session, user: AuthenticatedUser, item_id: int, payload: WishlistPromote
) -> GameRead:
    """The "I bought it" flow: wishlist entry → library game, atomically (the
    repo commits the insert and the delete together). The request's system
    wins over the stored one; games.system is NOT NULL so one of them must
    exist. Library duplicate (name, system) is a 409, with the games unique
    constraint backstopping the race as in create_my_game."""
    item = me_repo.get_wishlist_item_for_owner(db, item_id, user.id)
    if item is None:
        raise WishlistItemNotFoundError(item_id)

    system = payload.system.strip() or (item.system or "").strip()
    if not system:
        raise SystemRequiredError()
    # The other door into the games table — capped identically, or the limit
    # would be trivially bypassed by wishlisting first and promoting.
    limit = get_settings().max_games
    if me_repo.count_games(db, user.id) >= limit:
        raise LibraryFullError(limit)
    if me_repo.find_game_by_name_and_system(db, user.id, item.name, system):
        raise GameExistsError(item.name, system)

    try:
        game = me_repo.promote_wishlist_item(db, item, system=system)
    except IntegrityError as exc:
        db.rollback()
        raise GameExistsError(item.name, system) from exc
    # Fresh from the wishlist, so no sessions exist yet.
    return to_game_read(game, derive_play_state([]))


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

    try:
        me_repo.create_session(db, game.id, payload.start_date, payload.end_date)
    except IntegrityError as exc:
        # The partial unique index (one open session per game) fired: a
        # concurrent "start playing" won the race between our check above and
        # this insert. Roll back and re-report it as the same 409 the check
        # would have produced.
        db.rollback()
        winner = me_repo.get_open_session_for_game(db, game.id)
        since = winner.start_date.isoformat() if winner else payload.start_date.isoformat()
        raise AlreadyPlayingError(game.name, since) from exc
    return _game_read_with_fresh_state(db, game)


def close_my_session(
    db: Session, user: AuthenticatedUser, session_id: int, payload: SessionClose
) -> GameRead:
    """Stop playing: set the session's end date, optionally rating the game in
    the same transaction (rate-on-stop). Rating follows PATCH semantics —
    omitted leaves it alone, ""/null clears to unrated."""
    found = me_repo.get_session_for_owner(db, session_id, user.id)
    if found is None:
        raise SessionNotFoundError(session_id)
    play_session, game = found
    if play_session.end_date is not None:
        raise SessionAlreadyClosedError(session_id)
    if payload.end_date < play_session.start_date:
        raise SessionDatesError(
            f"endDate must not be before the session's start date "
            f"({play_session.start_date.isoformat()})."
        )

    rate = "rating" in payload.model_fields_set
    me_repo.finish_session(
        db,
        play_session,
        payload.end_date,
        rated_game=game if rate else None,
        rating=payload.rating or None,
    )
    return _game_read_with_fresh_state(db, game)
