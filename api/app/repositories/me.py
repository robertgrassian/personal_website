"""Queries backing the authenticated /me endpoints. SQLAlchemy only — no
business rules, no HTTP (same layering as repositories/users.py).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Profile


def get_profile_by_id(db: Session, user_id: uuid.UUID) -> Profile | None:
    return db.get(Profile, user_id)


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
