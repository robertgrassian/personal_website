"""Authenticated endpoints acting on the caller's own account.

Every route here depends on ``CurrentUser`` — the JWT verification dependency
(app/core/auth.py) — so an absent or invalid token is a 401 before any handler
runs. HTTP concerns only: map the service's domain exceptions to status codes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser
from app.core.config import API_PREFIX
from app.core.db import get_db
from app.core.guards import forbid_in_preview
from app.schemas.me import (
    GameCreate,
    GameUpdate,
    MyProfileRead,
    ProfileCreate,
    SessionClose,
    SessionCreate,
)
from app.schemas.users import GameRead
from app.services import me as me_service
from app.services.me import (
    AlreadyPlayingError,
    GameExistsError,
    GameNotFoundError,
    OnboardingRequiredError,
    ProfileExistsError,
    SessionAlreadyClosedError,
    SessionDatesError,
    SessionNotFoundError,
    SignupCapReachedError,
    UsernameError,
)

router = APIRouter(prefix=API_PREFIX, tags=["me"])

DbSession = Annotated[Session, Depends(get_db)]


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
    # First mutating endpoint: refuse writes on preview deploys.
    dependencies=[Depends(forbid_in_preview)],
)
def create_my_profile(user: CurrentUser, db: DbSession, payload: ProfileCreate) -> MyProfileRead:
    """Complete onboarding by creating the caller's profile.

    Status mapping:
    - 409 profile already exists (onboarding is one-time)
    - 409 username taken
    - 422 username bad format / reserved (client must change it)
    - 403 signup cap reached ("at capacity")
    """
    try:
        return me_service.create_my_profile(db, user, payload)
    except ProfileExistsError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except UsernameError as exc:
        # "taken" is a conflict; "format"/"reserved" are unprocessable input.
        code = (
            status.HTTP_409_CONFLICT
            if exc.reason == "taken"
            else status.HTTP_422_UNPROCESSABLE_CONTENT
        )
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    except SignupCapReachedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post(
    "/me/games",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(forbid_in_preview)],
)
def create_my_game(user: CurrentUser, db: DbSession, payload: GameCreate) -> GameRead:
    """Add a game to the caller's library (from an IGDB pick or entered by
    hand). Returns the created game in the public wire shape.

    Status mapping:
    - 409 same (name, system) already in the library
    - 403 authenticated but not onboarded yet
    - 422 blank name/system, unknown rating, non-IGDB imageUrl (schema)
    """
    try:
        return me_service.create_my_game(db, user, payload)
    except GameExistsError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except OnboardingRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.delete(
    "/me/games/{game_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(forbid_in_preview)],
)
def delete_my_game(user: CurrentUser, db: DbSession, game_id: int) -> None:
    """Remove a game and (via cascade) its play sessions. 404 covers both a
    nonexistent id and someone else's game, as everywhere under /me."""
    try:
        me_service.delete_my_game(db, user, game_id)
    except GameNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/me/games/{game_id}", dependencies=[Depends(forbid_in_preview)])
def update_my_game(
    user: CurrentUser, db: DbSession, game_id: int, payload: GameUpdate
) -> GameRead:
    """Partially edit one of the caller's games (currently: rating).

    404 covers both a nonexistent id and someone else's game — the service
    treats the caller's library as the whole namespace. Unknown rating values
    are a 422 from the schema validator before this handler runs.
    """
    try:
        return me_service.update_my_game(db, user, game_id, payload)
    except GameNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/me/games/{game_id}/sessions",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(forbid_in_preview)],
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
    try:
        return me_service.create_my_session(db, user, game_id, payload)
    except GameNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AlreadyPlayingError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.patch("/me/sessions/{session_id}", dependencies=[Depends(forbid_in_preview)])
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
    try:
        return me_service.close_my_session(db, user, session_id, payload)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except SessionAlreadyClosedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except SessionDatesError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
