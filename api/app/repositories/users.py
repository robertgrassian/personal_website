"""Queries backing the public user reads. SQLAlchemy only — no business
rules, no HTTP. Functions take a Session plus plain arguments and return ORM
entities or scalars.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Follow, Game, PlaySession, Profile, WishlistItem


def get_profile_by_username(db: Session, username: str) -> Profile | None:
    # username is citext, so this equality is case-insensitive in the DB —
    # /u/Robert and /u/robert resolve to the same row.
    return db.execute(select(Profile).where(Profile.username == username)).scalar_one_or_none()


def list_games(db: Session, user_id: uuid.UUID) -> list[Game]:
    # Ordered by id for a deterministic response (insertion order).
    return list(db.execute(select(Game).where(Game.user_id == user_id).order_by(Game.id)).scalars())


def list_play_sessions(db: Session, game_ids: Sequence[int]) -> list[PlaySession]:
    """All sessions for the given games in one query — the service groups them
    per game in Python, avoiding an N+1 over the library."""
    if not game_ids:
        return []
    return list(db.execute(select(PlaySession).where(PlaySession.game_id.in_(game_ids))).scalars())


def list_wishlist_items(db: Session, user_id: uuid.UUID) -> list[WishlistItem]:
    return list(
        db.execute(
            select(WishlistItem).where(WishlistItem.user_id == user_id).order_by(WishlistItem.id)
        ).scalars()
    )


def count_followers(db: Session, user_id: uuid.UUID) -> int:
    # COUNT(*) per request is fine at this scale (spec §4.2); denormalized
    # counters are a later optimization if ever needed.
    return db.execute(
        select(func.count()).select_from(Follow).where(Follow.followee_id == user_id)
    ).scalar_one()


def count_following(db: Session, user_id: uuid.UUID) -> int:
    return db.execute(
        select(func.count()).select_from(Follow).where(Follow.follower_id == user_id)
    ).scalar_one()
