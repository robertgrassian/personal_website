"""Persistence for the IGDB proxy: the Twitch token cache.

SQLAlchemy only — no business rules, no HTTP (same layering as the other
repositories).
"""

from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import IgdbToken


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
