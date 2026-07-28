"""Persistence for per-user rate-limit counters.

Lived in the IGDB repository while game search was the only limited
operation; moved out once writes were limited too, since the table was
never IGDB-specific (``rate_limits`` is keyed by user and bucket).

SQLAlchemy only — no business rules, no HTTP (same layering as the other
repositories).
"""

import uuid
from datetime import timedelta

from sqlalchemy import case, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import RateLimit


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

    Fixed windows, not a sliding average: a caller who spends their budget at
    the end of one window and again at the start of the next can briefly send
    2x the limit. Accepted — this protects a quota, it isn't a security control.
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
