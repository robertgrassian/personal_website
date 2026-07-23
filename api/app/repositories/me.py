"""Queries backing the authenticated /me endpoints. SQLAlchemy only — no
business rules, no HTTP (same layering as repositories/users.py).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Game, Profile


def get_profile_by_id(db: Session, user_id: uuid.UUID) -> Profile | None:
    return db.get(Profile, user_id)


def get_game_for_owner(db: Session, game_id: int, user_id: uuid.UUID) -> Game | None:
    # Ownership lives in the WHERE clause: someone else's game id comes back
    # None, indistinguishable from a nonexistent one — both surface as 404.
    return db.execute(
        select(Game).where(Game.id == game_id, Game.user_id == user_id)
    ).scalar_one_or_none()


def update_game_rating(db: Session, game: Game, rating: str | None) -> Game:
    game.rating = rating
    db.commit()
    db.refresh(game)
    return game


def username_exists(db: Session, username: str) -> bool:
    # citext equality: case-insensitive, matching the unique index.
    return (
        db.execute(select(Profile.id).where(Profile.username == username)).scalar_one_or_none()
        is not None
    )


def count_profiles(db: Session) -> int:
    return db.execute(select(func.count()).select_from(Profile)).scalar_one()


def create_profile(db: Session, *, user_id: uuid.UUID, username: str, display_name: str) -> Profile:
    profile = Profile(id=user_id, username=username, display_name=display_name)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
