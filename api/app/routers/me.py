"""Authenticated endpoints acting on the caller's own account.

Every route here depends on ``CurrentUser`` — the JWT verification dependency
(app/core/auth.py) — so an absent or invalid token is a 401 before any handler
runs. HTTP concerns only: map the service's domain exceptions to status codes.
"""

from fastapi import APIRouter, HTTPException, status

from app.core.auth import CurrentUser
from app.core.db import DbSession
from app.core.guards import WRITE_GUARDS
from app.schemas.me import (
    GameCreate,
    GameNoteRead,
    GameNoteWrite,
    GameUpdate,
    MyProfileRead,
    ProfileCreate,
    RelationshipRead,
    SessionClose,
    SessionCreate,
    WishlistCreate,
    WishlistPromote,
    WishlistUpdate,
)
from app.schemas.users import GameRead, WishlistGameRead
from app.services import follows as follows_service
from app.services import me as me_service

router = APIRouter(tags=["me"])


@router.get("/me/profile")
def read_my_profile(user: CurrentUser, db: DbSession) -> MyProfileRead:
    """The caller's profile. 404 when onboarding isn't complete (authenticated
    but no profile yet) — the FE reads that as "go to onboarding", distinct
    from a 401 (not logged in at all)."""
    profile = me_service.get_my_profile(db, user)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile yet — complete onboarding.",
        )
    return profile


@router.post(
    "/me/profile",
    status_code=status.HTTP_201_CREATED,
    dependencies=WRITE_GUARDS,
)
def create_my_profile(user: CurrentUser, db: DbSession, payload: ProfileCreate) -> MyProfileRead:
    """Complete onboarding by creating the caller's profile.

    Status mapping:
    - 409 profile already exists (onboarding is one-time)
    - 409 username taken
    - 422 username bad format / reserved (client must change it)
    - 403 signup cap reached ("at capacity")
    """
    return me_service.create_my_profile(db, user, payload)


@router.delete(
    "/me/account",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=WRITE_GUARDS,
)
def delete_my_account(user: CurrentUser, db: DbSession) -> None:
    """Delete the caller's account: the auth user, the profile, and everything
    that cascades from it (games, play sessions, wishlist, follow edges).

    Succeeds for a caller who never finished onboarding — there is no profile
    to delete, but the auth user is theirs and still deletable. Idempotent for
    the same reason follow/unfollow are: a repeat on a still-valid token for an
    already-deleted account is 204, not an error.

    Status mapping:
    - 204 deleted
    - 403 the founder's account, which the rest of the site depends on
    - 503 the accounts service is unreachable, unconfigured, or answered in a
      way that could not be confirmed; nothing deleted
    """
    me_service.delete_my_account(db, user)


@router.post(
    "/me/games",
    status_code=status.HTTP_201_CREATED,
    dependencies=WRITE_GUARDS,
)
def create_my_game(user: CurrentUser, db: DbSession, payload: GameCreate) -> GameRead:
    """Add a game to the caller's library (from an IGDB pick or entered by
    hand). Returns the created game in the public wire shape.

    Status mapping:
    - 409 same (name, system) already in the library
    - 403 authenticated but not onboarded yet, or the library is at MAX_GAMES
    - 422 blank name/system, unknown rating, non-IGDB imageUrl (schema)
    """
    return me_service.create_my_game(db, user, payload)


@router.delete(
    "/me/games/{game_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=WRITE_GUARDS,
)
def delete_my_game(user: CurrentUser, db: DbSession, game_id: int) -> None:
    """Remove a game and (via cascade) its play sessions. 404 covers both a
    nonexistent id and someone else's game, as everywhere under /me."""
    me_service.delete_my_game(db, user, game_id)


@router.patch(
    "/me/games/{game_id}",
    dependencies=WRITE_GUARDS,
)
def update_my_game(user: CurrentUser, db: DbSession, game_id: int, payload: GameUpdate) -> GameRead:
    """Partially edit one of the caller's games (currently: rating).

    404 covers both a nonexistent id and someone else's game — the service
    treats the caller's library as the whole namespace. Unknown rating values
    are a 422 from the schema validator before this handler runs.
    """
    return me_service.update_my_game(db, user, game_id, payload)


@router.get("/me/games/{game_id}/note")
def read_my_game_note(user: CurrentUser, db: DbSession, game_id: int) -> GameNoteRead:
    """The caller's notes on one of their games.

    Deliberately NOT mirrored under /users/{username} — notes are owner-only,
    which is also what keeps them out of the cached public library payload. No
    WRITE_GUARDS: this is a read, and charging it against the write budget
    would let opening game cards exhaust the allowance for real edits.
    """
    return me_service.get_my_game_note(db, user, game_id)


@router.put(
    "/me/games/{game_id}/note",
    dependencies=WRITE_GUARDS,
)
def write_my_game_note(
    user: CurrentUser, db: DbSession, game_id: int, payload: GameNoteWrite
) -> GameNoteRead:
    """Replace the notes on one of the caller's games; a blank body clears them.

    Separate from PATCH /me/games/{game_id} rather than another field on
    GameUpdate: that route answers with a whole GameRead, which notes stay off
    by design, and a 20,000-character body has no business riding a rating edit.

    404 covers both a nonexistent id and someone else's game. Over-length is a
    422 from the schema before this handler runs.
    """
    return me_service.set_my_game_note(db, user, game_id, payload)


@router.post(
    "/me/wishlist",
    status_code=status.HTTP_201_CREATED,
    dependencies=WRITE_GUARDS,
)
def create_my_wishlist_item(
    user: CurrentUser, db: DbSession, payload: WishlistCreate
) -> WishlistGameRead:
    """Add a wishlist entry (only name required — system may stay undecided).

    Status mapping: 409 name already wishlisted / 403 not onboarded / 422
    blank name or non-IGDB imageUrl (schema).
    """
    return me_service.create_my_wishlist_item(db, user, payload)


@router.patch(
    "/me/wishlist/{item_id}",
    dependencies=WRITE_GUARDS,
)
def update_my_wishlist_item(
    user: CurrentUser, db: DbSession, item_id: int, payload: WishlistUpdate
) -> WishlistGameRead:
    """Partially edit a wishlist entry (starred / notes / system; system ""
    clears to undecided). 404 = nonexistent or someone else's."""
    return me_service.update_my_wishlist_item(db, user, item_id, payload)


@router.delete(
    "/me/wishlist/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=WRITE_GUARDS,
)
def delete_my_wishlist_item(user: CurrentUser, db: DbSession, item_id: int) -> None:
    """Remove a wishlist entry. 404 = nonexistent or someone else's."""
    me_service.delete_my_wishlist_item(db, user, item_id)


@router.post(
    "/me/wishlist/{item_id}/promote",
    status_code=status.HTTP_201_CREATED,
    dependencies=WRITE_GUARDS,
)
def promote_my_wishlist_item(
    user: CurrentUser, db: DbSession, item_id: int, payload: WishlistPromote
) -> GameRead:
    """Promote a wishlist entry into the library ("I bought it") — the game
    is created and the wishlist row removed in one transaction. Returns the
    new library game (unrated, no sessions).

    Status mapping: 404 item not found / 409 (name, system) already in the
    library / 422 no system anywhere (games require one) / 403 library at
    MAX_GAMES.
    """
    return me_service.promote_my_wishlist_item(db, user, item_id, payload)


@router.post(
    "/me/games/{game_id}/sessions",
    status_code=status.HTTP_201_CREATED,
    dependencies=WRITE_GUARDS,
)
def create_my_session(
    user: CurrentUser, db: DbSession, game_id: int, payload: SessionCreate
) -> GameRead:
    """Start playing one of the caller's games (no endDate → open session) or
    log a past playthrough (both dates). Returns the game with fresh play
    state.

    Status mapping:
    - 404 game nonexistent or someone else's
    - 409 game already has an open session (only when opening another)
    - 422 endDate before startDate (schema validator)
    """
    return me_service.create_my_session(db, user, game_id, payload)


@router.patch(
    "/me/sessions/{session_id}",
    dependencies=WRITE_GUARDS,
)
def close_my_session(
    user: CurrentUser, db: DbSession, session_id: int, payload: SessionClose
) -> GameRead:
    """Close an open session ("stop playing"), optionally rating the game in
    the same transaction. Returns the game with fresh play state.

    Status mapping:
    - 404 session nonexistent or under someone else's game
    - 409 session already closed
    - 422 endDate before the session's start date
    """
    return me_service.close_my_session(db, user, session_id, payload)


@router.get("/me/relationship/{username}")
def read_my_relationship(user: CurrentUser, db: DbSession, username: str) -> RelationshipRead:
    """The caller's relationship to another user — what the follow button reads
    on mount. A /me route rather than a field on the public profile because it
    differs per viewer and must never be cached (spec §7.2).

    Status mapping:
    - 403 authenticated but not onboarded yet
    - 404 no such username
    """
    return follows_service.get_relationship(db, user.id, username)


@router.put(
    "/me/following/{username}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=WRITE_GUARDS,
)
def follow_user(user: CurrentUser, db: DbSession, username: str) -> None:
    """Follow a user. Idempotent: following someone you already follow is 204,
    not a conflict, so a double-fired toggle needs no special handling.

    PUT rather than POST because of that idempotence. The edge from the caller
    to {username} is one addressable thing, and POST is defined as unsafe to
    repeat — clients and intermediaries are entitled to refuse to retry it,
    which is exactly backwards for a toggle that is safe to send twice.

    Status mapping:
    - 403 authenticated but not onboarded yet
    - 404 no such username
    - 422 following yourself
    """
    follows_service.follow_user(db, user.id, username)


@router.delete(
    "/me/following/{username}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=WRITE_GUARDS,
)
def unfollow_user(user: CurrentUser, db: DbSession, username: str) -> None:
    """Unfollow a user. Idempotent, like follow. The founder edge created at
    signup is an ordinary row and can be removed here like any other.

    Status mapping:
    - 403 authenticated but not onboarded yet
    - 404 no such username
    - 422 unfollowing yourself
    """
    follows_service.unfollow_user(db, user.id, username)
