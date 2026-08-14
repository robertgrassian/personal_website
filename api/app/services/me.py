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
from datetime import date, timedelta

from fastapi import status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser
from app.core.config import FOUNDER_USERNAME, get_settings
from app.core.errors import DomainError
from app.core.supabase_admin import (
    AuthUserDeleteError,
    delete_auth_user,
    delete_auth_user_or_raise,
)
from app.models import Profile
from app.models.game import MAX_GENRE_LENGTH
from app.repositories import me as me_repo
from app.repositories import rate_limit as rate_limit_repo
from app.repositories import users as users_repo
from app.schemas.me import (
    CatalogPreview,
    GameCreate,
    GameUpdate,
    MyProfileRead,
    ProfileCreate,
    SessionClose,
    SessionCreate,
    WishlistCreate,
    WishlistPromote,
    WishlistUpdate,
    clean_genres,
)
from app.schemas.users import GameRead, WishlistGameRead
from app.services import genres as genre_service
from app.services import rate_limit
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


class FounderUndeletableError(DomainError):
    """The founder's account cannot be self-deleted. See delete_my_account for
    the three separate ways it is unrecoverable."""

    status_code = status.HTTP_403_FORBIDDEN

    def __init__(self) -> None:
        super().__init__(
            "This account cannot be deleted from the site, because the rest of the site depends "
            "on it. Remove it directly in the database if you really mean to."
        )


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
    """The caller's library already has this game.

    Console-independent since normalization: one entry per game per user, so
    adding a game you own on a different console is this error rather than a
    second row. Changing which console an entry records is an edit, not an add.
    """

    status_code = status.HTTP_409_CONFLICT

    def __init__(self, name: str) -> None:
        super().__init__(f"{name} is already in your library.")


class OnboardingRequiredError(DomainError):
    """Authenticated but no profile row yet. Several tables reference profiles
    (played_games.user_id, follows.follower_id), so writing any of them before
    onboarding is an FK violation. The explicit check turns what would be a 500
    — misread as a duplicate by the IntegrityError backstop — into a clear 403.

    ``action`` names what was attempted, so a follow is not told to complete
    onboarding "before adding games"."""

    status_code = status.HTTP_403_FORBIDDEN

    def __init__(self, action: str = "doing that") -> None:
        super().__init__(f"Complete onboarding before {action}.")


class WishlistItemExistsError(DomainError):
    """The caller's wishlist already has this game (one entry per game)."""

    status_code = status.HTTP_409_CONFLICT

    def __init__(self, name: str) -> None:
        super().__init__(f"{name} is already on your wishlist.")


class WishlistItemNotFoundError(DomainError):
    """No such wishlist item in the caller's list — 404-over-403, as usual."""

    status_code = status.HTTP_404_NOT_FOUND

    def __init__(self, item_id: int) -> None:
        super().__init__(f"Wishlist item {item_id} not found.")


class SystemRequiredError(DomainError):
    """Promoting needs a system (played_games.system is NOT NULL) and neither the
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
    references auth.users(id) ON DELETE CASCADE, and played_games / wishlist_games /
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
    and it is the state that most deserves a working delete.
    """
    profile = me_repo.get_profile_by_id(db, user.id)

    # The founder's account is not deletable, and this is the only place that
    # can say so. Deleting it is unrecoverable in three separate ways: the
    # handle is in RESERVED_USERNAMES so signup can never reclaim it, even by
    # the founder; /video-games is linked from the homepage tile and calls
    # notFound() when the profile is missing; and opengraph-image.tsx
    # prerenders getGames(LIBRARY_OWNER_USERNAME), which throws on a 404 and
    # fails the next production build. Recovering means a manual reseed.
    #
    # A 403 rather than a hidden control: the UI is shared with every other
    # user, and a server-side refusal cannot be missed by a future surface that
    # forgets to hide the button.
    if profile is not None and profile.username == FOUNDER_USERNAME:
        raise FounderUndeletableError()

    deleted = delete_auth_user_or_raise(user.id)

    # A 404 from the Admin API means "the API found no such user", which is not
    # the same as "the user is gone". The URL is concatenated from an env var,
    # so a SUPABASE_URL with a trailing slash or a stray /auth/v1 404s with
    # every row still in place — and until this endpoint existed, nothing
    # depended on that value being right, because the only other consumer is
    # the best-effort signup cleanup that logs failures and moves on.
    #
    # The profile row settles it: a genuinely deleted auth user takes it via
    # ON DELETE CASCADE, so one that is still here means the delete did not
    # happen. Uses only tables this app owns, and needs no second Admin call.
    #
    # Remaining gap, accepted: a never-onboarded user has no profile to check,
    # so a bogus 404 still reads as success for them. The blast radius is one
    # auth row and nothing else, since there is nothing else to delete.
    if not deleted and me_repo.profile_exists(db, user.id):
        logger.error(
            "Admin API 404'd for %s but the profile row survives; treating as a failed delete "
            "(check SUPABASE_URL)",
            user.id,
        )
        raise AuthUserDeleteError()

    # Past this line the account is gone and nothing can put it back, so no
    # later failure may be reported to the caller as one. A transient DB error
    # here would otherwise 500 and tell someone their deletion failed while
    # every row of theirs was already destroyed — and the frontend would then
    # skip both the sign-out and the cache purge. What is left behind is a bare
    # (uuid, bucket, count) tuple with no FK and no personal data in it.
    try:
        rate_limit_repo.delete_for_user(db, user.id)
    except SQLAlchemyError:
        logger.exception("Account %s deleted, but its rate_limits rows survive", user.id)

    logger.info("Deleted account %s", user.id)


def _genres_for_new_catalog_row(
    db: Session,
    *,
    user_id: uuid.UUID,
    igdb_id: int | None,
    name: str,
    from_client: list[str],
) -> list[str]:
    """The genres to store for a game being added, sourced from Wikipedia.

    IGDB's genre field is too coarse to describe a library (Hades II with no
    roguelike anywhere); Wikipedia's infoboxes are where the shelves' existing
    vocabulary came from. See services/genres.py. Sourcing on the write path is
    what keeps the two agreeing, so scripts/backfill_genres.py stays a repair
    tool rather than the only way good genres ever land.

    Three cases where the lookup is skipped, and none of them is an error:

      * The catalog row already exists, so its genres win and anything sent
        here is discarded regardless. The common case, and it costs nothing.
      * A hand-entered game whose genres the caller typed. A private row is
        theirs to name; overriding it would be the silent discard this path
        exists to avoid.
      * Wikipedia has no article, or is down. Falling back to the client's
        genres keeps a third-party outage from failing an add.
    """
    if me_repo.find_metadata(db, user_id=user_id, igdb_id=igdb_id, name=name) is not None:
        return from_client
    # End the read transaction the queries above opened, before a call that can
    # block for seconds. SQLAlchemy autobegins on the first statement, so
    # "nothing has been written yet" does NOT mean "no transaction is open" —
    # under NullPool and a transaction-mode pooler, that would hold a pooler
    # connection idle-in-transaction for the whole Wikipedia round trip. The
    # writes below autobegin a fresh one.
    db.rollback()
    return _sourced_genres(igdb_id=igdb_id, name=name, from_client=from_client)


def _sourced_genres(*, igdb_id: int | None, name: str, from_client: list[str]) -> list[str]:
    """The genres for a catalog row that does not exist yet. Split out of the
    function above so preview_catalog_entry decides the same way an add does.

    Note what that does and does not buy: the two share this implementation, so
    they cannot disagree about the RULE, but each makes its own Wikipedia call,
    so a lookup that succeeds for the preview and times out for the add will
    still store something the popover did not show. Nothing short of caching
    the result fixes that, and a serverless function has nowhere to cache it.
    """
    if igdb_id is None and from_client:
        return from_client
    # Two outbound requests on the slowest add there is: a game nobody has
    # entered before. Bounded by lookup_one, which never raises and skips the
    # Wikidata leg.
    sourced = _shaped_genres(genre_service.lookup_one(name))
    # Shaping first, emptiness second. The other order looks equivalent and is
    # not: a single over-long infobox genre is a truthy lookup that shapes down
    # to nothing, which would then be stored as "no genres" instead of falling
    # back to what the client sent.
    return sourced or from_client


def _shaped_genres(genres: list[str]) -> list[str]:
    """Genres shaped the way a create schema would shape them. Values reaching
    the catalog from Wikipedia or a query string never pass through
    GameCreate, so the trim/dedupe/cap it applies is applied here instead.
    Over-long values are dropped rather than raising, because a malformed
    infobox must not fail an add."""
    return clean_genres([g for g in genres if len(g) <= MAX_GENRE_LENGTH])


# Its own bucket rather than the shared "writes" one: this is a read, and it
# can fan out to Wikipedia, so it needs a budget of its own. Sized like
# igdb_search, which the add flow calls immediately before it.
PREVIEW_RATE_LIMIT_BUCKET = "catalog_preview"
PREVIEW_RATE_LIMIT_MAX = 30
PREVIEW_RATE_LIMIT_WINDOW = timedelta(seconds=60)


def preview_catalog_entry(
    db: Session,
    user: AuthenticatedUser,
    *,
    name: str,
    igdb_id: int | None,
    genres: list[str],
    release_date: date | None,
) -> CatalogPreview:
    """The catalog values this game would end up with if it were added now.

    Answers the add form's "what is this game, actually?" without adding it.
    The point is that it resolves the SAME way the write path does rather than
    just looking genres up: a game whose catalog row already exists keeps that
    row's genres and release date, so a preview showing a fresh Wikipedia
    answer would be showing something the add will not store. Nothing here
    writes, beyond the rate-limit counter charged below.
    """
    rate_limit.enforce(
        db,
        user.id,
        PREVIEW_RATE_LIMIT_BUCKET,
        PREVIEW_RATE_LIMIT_MAX,
        PREVIEW_RATE_LIMIT_WINDOW,
        f"Too many game lookups: limited to {PREVIEW_RATE_LIMIT_MAX} per minute. "
        "Wait a moment and try again.",
    )
    existing = me_repo.find_metadata(db, user_id=user.id, igdb_id=igdb_id, name=name)
    if existing is not None:
        return CatalogPreview(genres=existing.genres, release_date=existing.release_date)
    # Same reason as the add path: do not hold a transaction open across the
    # lookup. rate_limit.enforce above commits its own, and find_metadata
    # reopened one.
    db.rollback()
    return CatalogPreview(
        # The client's genres are shaped before they are used as the fallback,
        # because the write path shapes them too (via GameCreate). Skipping it
        # here would let the popover show "RPG, rpg" for a row that will store
        # one of them.
        genres=_sourced_genres(igdb_id=igdb_id, name=name, from_client=_shaped_genres(genres)),
        release_date=release_date,
    )


def create_my_game(db: Session, user: AuthenticatedUser, payload: GameCreate) -> GameRead:
    """Add a game to the caller's library.

    Two inserts in one transaction: the catalog row for the game (reused if
    anyone has already added it, or if this caller already entered it by hand),
    then the caller's link row pointing at it.

    Already having the game is a conflict, whatever console the payload names —
    one entry per game per user. The explicit check gives the friendly message
    in the common case; uq_played_games_user_id_metadata_id is the real backstop
    for a concurrent double-submit (same pattern as onboarding).
    """
    if me_repo.get_profile_by_id(db, user.id) is None:
        raise OnboardingRequiredError("adding games")
    # Checked before the duplicate lookup so a full library says so plainly
    # rather than reporting whichever problem happens to be found first. Same
    # count-then-insert race as the signup cap: a burst of concurrent adds can
    # overshoot by a few. Accepted — this bounds abuse, it isn't an invariant.
    limit = get_settings().max_games
    if me_repo.count_games(db, user.id) >= limit:
        raise LibraryFullError(limit)

    # Before the transaction opens: this can make network calls, and holding a
    # Postgres transaction across a third-party request is how a slow Wikipedia
    # turns into held connections.
    genres = _genres_for_new_catalog_row(
        db,
        user_id=user.id,
        igdb_id=payload.igdb_id,
        name=payload.name,
        from_client=payload.genres,
    )

    try:
        meta = me_repo.find_or_create_metadata(
            db,
            user_id=user.id,
            igdb_id=payload.igdb_id,
            name=payload.name,
            genres=genres,
            release_date=payload.release_date,
            image_url=payload.image_url or None,
        )
        # Two checks, not one. The first is the constraint-backed "same game",
        # which for an IGDB game is the whole rule — identity is the igdb_id,
        # and find_or_create_metadata resolves that to one shared catalog row.
        # The second catches the same TITLE resolving to a different catalog
        # row (shared vs. hand-entered), which no constraint can express; it
        # takes the incoming igdb_id so it only fires where a title is really
        # all there is to compare.
        if me_repo.find_game_by_metadata(db, user.id, meta.id) or me_repo.find_game_by_name(
            db, user.id, meta.name, igdb_id=meta.igdb_id
        ):
            raise GameExistsError(payload.name)
        game = me_repo.create_game(
            db,
            user_id=user.id,
            metadata_id=meta.id,
            system=payload.system,
            rating=payload.rating or None,
        )
    except GameExistsError:
        # The catalog row may have been flushed but not committed; drop it
        # rather than leaving an orphan behind a rejected add.
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise GameExistsError(payload.name) from exc
    # A brand-new game has no sessions; skip the session query.
    return to_game_read(game, meta, derive_play_state([]))


def delete_my_game(db: Session, user: AuthenticatedUser, game_id: int) -> None:
    """Remove a game (and, via ON DELETE CASCADE, its play sessions) from the
    caller's library. Same 404-over-403 policy as every /me lookup."""
    found = me_repo.get_game_for_owner(db, game_id, user.id)
    if found is None:
        raise GameNotFoundError(game_id)
    game, _ = found
    me_repo.delete_game(db, game)


def update_my_game(
    db: Session, user: AuthenticatedUser, game_id: int, payload: GameUpdate
) -> GameRead:
    """Apply a partial edit to one of the caller's games and return the full
    updated game (same wire shape as the public reads, play state included, so
    the client can reconcile without a second fetch)."""
    found = me_repo.get_game_for_owner(db, game_id, user.id)
    if found is None:
        raise GameNotFoundError(game_id)
    game, meta = found

    # model_fields_set = fields present in the request body — PATCH semantics.
    # An omitted rating leaves the row untouched; "" (or null) clears to
    # unrated, stored as NULL per the schema convention.
    if "rating" in payload.model_fields_set:
        game = me_repo.update_game_rating(db, game, payload.rating or None)

    # System has no cleared state (played_games.system is NOT NULL), so the
    # schema rejects blank and null outright rather than reading either as
    # "unset it". The `is not None` below is therefore unreachable — it is
    # there to narrow the Optional, not to handle a case that can occur.
    if "system" in payload.model_fields_set and payload.system is not None:
        game = me_repo.update_game_system(db, game, payload.system)

    return _game_read_with_fresh_state(db, game, meta)


def _game_read_with_fresh_state(db: Session, game, meta) -> GameRead:
    """Re-derive play state from all of the game's sessions after a mutation —
    the wire shape every session write returns, so the client reconciles
    without a second fetch."""
    sessions = users_repo.list_play_sessions(db, [game.id])
    return to_game_read(game, meta, derive_play_state(sessions))


def create_my_wishlist_item(
    db: Session, user: AuthenticatedUser, payload: WishlistCreate
) -> WishlistGameRead:
    """Add a wishlist entry. Same shape as create_my_game: profile first (FK),
    resolve the catalog row, then a friendly dedupe 409 with the unique
    constraint as the concurrency backstop."""
    if me_repo.get_profile_by_id(db, user.id) is None:
        raise OnboardingRequiredError("using your wishlist")

    # Same sourcing as the library path, and before the transaction for the
    # same reason: a wishlist entry becomes a library game later, so the two
    # must agree on where genres come from or promoting one would change them.
    genres = _genres_for_new_catalog_row(
        db,
        user_id=user.id,
        igdb_id=payload.igdb_id,
        name=payload.name,
        from_client=payload.genres,
    )

    try:
        meta = me_repo.find_or_create_metadata(
            db,
            user_id=user.id,
            igdb_id=payload.igdb_id,
            name=payload.name,
            genres=genres,
            release_date=payload.release_date,
            image_url=payload.image_url or None,
        )
        # Same two-check shape as create_my_game: metadata id, then title.
        if me_repo.find_wishlist_item_by_metadata(
            db, user.id, meta.id
        ) or me_repo.find_wishlist_item_by_name(db, user.id, meta.name, igdb_id=meta.igdb_id):
            raise WishlistItemExistsError(payload.name)
        item = me_repo.create_wishlist_item(
            db,
            user_id=user.id,
            metadata_id=meta.id,
            system=payload.system or None,
            starred=payload.starred,
            notes=payload.notes,
            date_added=payload.date_added,
        )
    except WishlistItemExistsError:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise WishlistItemExistsError(payload.name) from exc
    return to_wishlist_read(item, meta)


def update_my_wishlist_item(
    db: Session, user: AuthenticatedUser, item_id: int, payload: WishlistUpdate
) -> WishlistGameRead:
    """Partial edit (starred / notes / system) with the same model_fields_set
    PATCH semantics as GameUpdate. system "" clears to undecided (NULL)."""
    found = me_repo.get_wishlist_item_for_owner(db, item_id, user.id)
    if found is None:
        raise WishlistItemNotFoundError(item_id)
    item, meta = found

    if "starred" in payload.model_fields_set and payload.starred is not None:
        item.starred = payload.starred
    if "notes" in payload.model_fields_set and payload.notes is not None:
        item.notes = payload.notes
    if "system" in payload.model_fields_set and payload.system is not None:
        item.system = payload.system.strip() or None
    item = me_repo.update_wishlist_item(db, item)
    return to_wishlist_read(item, meta)


def delete_my_wishlist_item(db: Session, user: AuthenticatedUser, item_id: int) -> None:
    found = me_repo.get_wishlist_item_for_owner(db, item_id, user.id)
    if found is None:
        raise WishlistItemNotFoundError(item_id)
    me_repo.delete_wishlist_item(db, found[0])


def promote_my_wishlist_item(
    db: Session, user: AuthenticatedUser, item_id: int, payload: WishlistPromote
) -> GameRead:
    """The "I bought it" flow: wishlist entry → library game, atomically (the
    repo commits the insert and the delete together). The request's system
    wins over the stored one; played_games.system is NOT NULL so one of them
    must exist. Already having the game is a 409, with the unique constraint
    backstopping the race as in create_my_game.

    The catalog row carries straight across, so nothing about the game is
    re-derived here and a promote cannot quietly lose its cover art or genres.
    """
    found = me_repo.get_wishlist_item_for_owner(db, item_id, user.id)
    if found is None:
        raise WishlistItemNotFoundError(item_id)
    item, meta = found

    system = payload.system.strip() or (item.system or "").strip()
    if not system:
        raise SystemRequiredError()
    # The other door into the games table — capped identically, or the limit
    # would be trivially bypassed by wishlisting first and promoting.
    limit = get_settings().max_games
    if me_repo.count_games(db, user.id) >= limit:
        raise LibraryFullError(limit)
    if me_repo.find_game_by_metadata(db, user.id, item.metadata_id) or me_repo.find_game_by_name(
        db, user.id, meta.name, igdb_id=meta.igdb_id
    ):
        raise GameExistsError(meta.name)

    try:
        game = me_repo.promote_wishlist_item(db, item, system=system)
    except IntegrityError as exc:
        db.rollback()
        raise GameExistsError(meta.name) from exc
    # Fresh from the wishlist, so no sessions exist yet.
    return to_game_read(game, meta, derive_play_state([]))


def create_my_session(
    db: Session, user: AuthenticatedUser, game_id: int, payload: SessionCreate
) -> GameRead:
    """Start playing (no endDate → open session) or log a past playthrough
    (both dates). Only one open session per game: opening a second is a
    conflict, matching the old session skill; logging closed past sessions is
    always allowed, even while the game is being played."""
    found = me_repo.get_game_for_owner(db, game_id, user.id)
    if found is None:
        raise GameNotFoundError(game_id)
    game, meta = found

    if payload.end_date is None:
        existing = me_repo.get_open_session_for_game(db, game.id)
        if existing is not None:
            raise AlreadyPlayingError(meta.name, existing.start_date.isoformat())

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
        raise AlreadyPlayingError(meta.name, since) from exc
    return _game_read_with_fresh_state(db, game, meta)


def close_my_session(
    db: Session, user: AuthenticatedUser, session_id: int, payload: SessionClose
) -> GameRead:
    """Stop playing: set the session's end date, optionally rating the game in
    the same transaction (rate-on-stop). Rating follows PATCH semantics —
    omitted leaves it alone, ""/null clears to unrated."""
    found = me_repo.get_session_for_owner(db, session_id, user.id)
    if found is None:
        raise SessionNotFoundError(session_id)
    play_session, game, meta = found
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
    return _game_read_with_fresh_state(db, game, meta)
