"""Queries backing the public user reads. SQLAlchemy only — no business
rules, no HTTP. Functions take a Session plus plain arguments and return ORM
entities or scalars.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Follow, GameMetadata, PlayedGame, PlaySession, Profile, WishlistGame


def get_profile_by_username(db: Session, username: str) -> Profile | None:
    # username is citext, so this equality is case-insensitive in the DB —
    # /u/Robert and /u/robert resolve to the same row.
    return db.execute(select(Profile).where(Profile.username == username)).scalar_one_or_none()


def list_games(db: Session, user_id: uuid.UUID) -> list[tuple[PlayedGame, GameMetadata]]:
    """Every library entry paired with its catalog row.

    One join rather than a second query per entry: the catalog holds the name,
    cover and genres the response needs, so fetching entries alone would be an
    N+1 waiting to happen. Still one statement, as before normalization.

    Ordered by id for a deterministic response (insertion order).
    """
    return list(
        db.execute(
            select(PlayedGame, GameMetadata)
            .join(GameMetadata, GameMetadata.id == PlayedGame.metadata_id)
            .where(PlayedGame.user_id == user_id)
            .order_by(PlayedGame.id)
        ).all()
    )


def list_play_sessions(db: Session, game_ids: Sequence[int]) -> list[PlaySession]:
    """All sessions for the given games in one query — the service groups them
    per game in Python, avoiding an N+1 over the library."""
    if not game_ids:
        return []
    return list(db.execute(select(PlaySession).where(PlaySession.game_id.in_(game_ids))).scalars())


def list_sessions_for_user(db: Session, user_id: uuid.UUID) -> list[PlaySession]:
    """Every session across the user's whole library, newest first.

    Distinct from list_play_sessions above, which takes the game ids the caller
    already loaded; this one starts from the user, so the play-history read does
    not have to fetch the library first just to name its games.

    Sorted here rather than in the service because the order is the query's to
    give: id breaks a same-day tie, matching derive_play_state's tiebreak so
    "newest" means the same thing in both places.
    """
    return list(
        db.execute(
            select(PlaySession)
            .join(PlayedGame, PlayedGame.id == PlaySession.game_id)
            .where(PlayedGame.user_id == user_id)
            .order_by(PlaySession.start_date.desc(), PlaySession.id.desc())
        ).scalars()
    )


def list_wishlist_items(db: Session, user_id: uuid.UUID) -> list[tuple[WishlistGame, GameMetadata]]:
    return list(
        db.execute(
            select(WishlistGame, GameMetadata)
            .join(GameMetadata, GameMetadata.id == WishlistGame.metadata_id)
            .where(WishlistGame.user_id == user_id)
            .order_by(WishlistGame.id)
        ).all()
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
