"""Queries over the follow graph. SQLAlchemy only — no business rules, no
HTTP. Functions take a Session plus plain arguments; writes commit themselves,
matching repositories/me.py.

Both writes are idempotent by construction, which is what lets the follow
button stay a plain toggle: a double-fired click, a retried request, or two
tabs racing all converge on the same single edge (or no edge) instead of
surfacing a conflict the UI would have to explain. The composite PK still
guarantees there is never a duplicate row.
"""

import uuid

from sqlalchemy import delete, exists, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Follow, Profile


def follow(db: Session, follower_id: uuid.UUID, followee_id: uuid.UUID) -> None:
    """Create the edge, or do nothing if it already exists.

    ON CONFLICT DO NOTHING targets the composite PK, so re-following is a
    no-op rather than an IntegrityError. Self-follows are rejected by the
    ck_follows_no_self_follow check constraint and are refused in the service
    before reaching here.
    """
    db.execute(
        insert(Follow)
        .values(follower_id=follower_id, followee_id=followee_id)
        .on_conflict_do_nothing()
    )
    db.commit()


def unfollow(db: Session, follower_id: uuid.UUID, followee_id: uuid.UUID) -> None:
    """Remove the edge if present. Deleting a nonexistent edge affects zero
    rows and is deliberately not an error."""
    db.execute(
        delete(Follow).where(Follow.follower_id == follower_id, Follow.followee_id == followee_id)
    )
    db.commit()


def is_following(db: Session, follower_id: uuid.UUID, followee_id: uuid.UUID) -> bool:
    """EXISTS rather than fetching the row: this answers the follow button's
    one question and runs on the composite PK index."""
    return bool(
        db.execute(
            select(
                exists().where(
                    Follow.follower_id == follower_id, Follow.followee_id == followee_id
                )
            )
        ).scalar()
    )


def list_followers(db: Session, user_id: uuid.UUID) -> list[Profile]:
    """Profiles that follow this user, newest edge first. Uses
    ix_follows_followee_id."""
    return list(
        db.execute(
            select(Profile)
            .join(Follow, Follow.follower_id == Profile.id)
            .where(Follow.followee_id == user_id)
            .order_by(Follow.created_at.desc(), Profile.username)
        ).scalars()
    )


def list_following(db: Session, user_id: uuid.UUID) -> list[Profile]:
    """Profiles this user follows, newest edge first."""
    return list(
        db.execute(
            select(Profile)
            .join(Follow, Follow.followee_id == Profile.id)
            .where(Follow.follower_id == user_id)
            .order_by(Follow.created_at.desc(), Profile.username)
        ).scalars()
    )
