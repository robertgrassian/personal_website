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


def get_profile_with_counts(db: Session, username: str) -> tuple[Profile, int, int] | None:
    """The profile row plus its follower and following counts, in one query.

    Returns ``(profile, follower_count, following_count)``, or None when no such
    user exists.

    The counts ride along as correlated scalar subqueries rather than as two
    follow-up ``SELECT count(*)`` round trips. Postgres evaluates them while it
    already has the profile row, so the whole payload costs one statement
    instead of three — worth more than it looks under NullPool, where the
    connection is not held open between statements.

    COUNT(*) per request rather than denormalized counter columns is still the
    right call at this scale: a counter column has to be kept correct on every
    follow and unfollow, and these numbers are small and cheap to derive.

    Separate from ``get_profile_by_username`` on purpose. The games and wishlist
    reads resolve a profile too, and they have no use for follow counts.
    """
    follower_count = (
        select(func.count())
        .select_from(Follow)
        .where(Follow.followee_id == Profile.id)
        .correlate(Profile)
        .scalar_subquery()
    )
    following_count = (
        select(func.count())
        .select_from(Follow)
        .where(Follow.follower_id == Profile.id)
        .correlate(Profile)
        .scalar_subquery()
    )
    row = db.execute(
        select(Profile, follower_count, following_count).where(Profile.username == username)
    ).one_or_none()
    if row is None:
        return None
    return row[0], row[1], row[2]
