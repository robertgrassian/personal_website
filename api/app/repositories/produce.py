"""All SQL for produce tastings."""

import uuid
from datetime import date

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import ProduceTasting


def list_tastings(db: Session, user_id: uuid.UUID, year: int) -> list[ProduceTasting]:
    return list(
        db.execute(
            select(ProduceTasting)
            .where(ProduceTasting.user_id == user_id, ProduceTasting.year == year)
            .order_by(ProduceTasting.produce_slug)
        ).scalars()
    )


def tasting_exists(db: Session, user_id: uuid.UUID, slug: str, year: int) -> bool:
    return db.get(ProduceTasting, (user_id, slug, year)) is not None


def count_tastings(db: Session, user_id: uuid.UUID) -> int:
    """Every tasting the user has, across all years."""
    return db.execute(
        select(func.count()).select_from(ProduceTasting).where(ProduceTasting.user_id == user_id)
    ).scalar_one()


def upsert_tasting(
    db: Session, user_id: uuid.UUID, slug: str, year: int, eaten_on: date
) -> ProduceTasting:
    """Record the tasting, or move its date if the row exists.

    One INSERT ... ON CONFLICT rather than read-then-write, so a second tap from
    another device is an update and never an IntegrityError.
    """
    stmt = (
        pg_insert(ProduceTasting)
        .values(user_id=user_id, produce_slug=slug, year=year, eaten_on=eaten_on)
        .on_conflict_do_update(
            index_elements=[
                ProduceTasting.user_id,
                ProduceTasting.produce_slug,
                ProduceTasting.year,
            ],
            set_={"eaten_on": eaten_on},
        )
        .returning(ProduceTasting)
    )
    # populate_existing: tasting_exists may have loaded this row into the
    # identity map, which would otherwise hand back its pre-write date.
    row = db.execute(stmt, execution_options={"populate_existing": True}).scalar_one()
    db.commit()
    return row


def delete_tasting(db: Session, user_id: uuid.UUID, slug: str, year: int) -> None:
    """A statement rather than a loaded row, so an absent tasting is a no-op."""
    db.execute(
        delete(ProduceTasting).where(
            ProduceTasting.user_id == user_id,
            ProduceTasting.produce_slug == slug,
            ProduceTasting.year == year,
        )
    )
    db.commit()
