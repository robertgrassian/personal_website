"""Public read endpoints for user libraries and profiles (spec §6).

No auth: all three routes serve public, cacheable data (spec §7.2). HTTP
concerns only — each handler delegates to the service and maps the domain
``UserNotFoundError`` to a 404 with FastAPI's standard ``{"detail": ...}``
error shape.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import API_PREFIX
from app.core.db import get_db
from app.schemas.users import GameRead, ProfileRead, WishlistGameRead
from app.services import users as users_service
from app.services.users import UserNotFoundError

router = APIRouter(prefix=API_PREFIX, tags=["users"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/users/{username}/games")
def read_user_games(username: str, db: DbSession) -> list[GameRead]:
    try:
        return users_service.get_user_games(db, username)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/users/{username}/wishlist")
def read_user_wishlist(username: str, db: DbSession) -> list[WishlistGameRead]:
    try:
        return users_service.get_user_wishlist(db, username)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/users/{username}")
def read_user_profile(username: str, db: DbSession) -> ProfileRead:
    try:
        return users_service.get_user_profile(db, username)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
