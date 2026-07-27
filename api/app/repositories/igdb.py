"""Persistence for the IGDB proxy: token cache + rate-limit counters.

SQLAlchemy only — no business rules, no HTTP (same layering as the other
repositories).
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import case, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import IgdbToken, RateLimit


def get_token(db: Session) -> IgdbToken | None:
    return db.get(IgdbToken, 1)


def upsert_token(db: Session, access_token: str, expires_at: datetime) -> None:
    # Always row id=1 (the CHECK forbids anything else). ``excluded`` is
    # Postgres's name for the row the INSERT proposed — "on conflict, take
    # the new values".
    stmt = pg_insert(IgdbToken).values(id=1, access_token=access_token, expires_at=expires_at)
    stmt = stmt.on_conflict_do_update(
        index_elements=[IgdbToken.id],
        set_={"access_token": stmt.excluded.access_token, "expires_at": stmt.excluded.expires_at},
    )
    db.execute(stmt)
    db.commit()


def increment_rate_limit(db: Session, user_id: uuid.UUID, bucket: str, window: timedelta) -> int:
    """Count this request against the caller's fixed window and return the
    new count; the caller compares it to the limit.

    One atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING: the CASE
    either resets an expired window to 1 or increments the live one, so
    concurrent requests can never read-then-clobber each other's counts —
    Postgres serializes the row update. Both sides of the comparison use the
    DB clock (now() minus an interval), never the Python clock.

    In the update branch, ``RateLimit.window_start`` refers to the EXISTING
    row's value (Postgres semantics for ON CONFLICT DO UPDATE), which is
    exactly what the window check needs.
    """
    cutoff = func.now() - window
    expired = RateLimit.window_start < cutoff
    stmt = (
        pg_insert(RateLimit)
        .values(user_id=user_id, bucket=bucket, window_start=func.now(), count=1)
        .on_conflict_do_update(
            index_elements=[RateLimit.user_id, RateLimit.bucket],
            set_={
                "window_start": case((expired, func.now()), else_=RateLimit.window_start),
                "count": case((expired, 1), else_=RateLimit.count + 1),
            },
        )
        .returning(RateLimit.count)
    )
    count = db.execute(stmt).scalar_one()
    db.commit()
    return count
