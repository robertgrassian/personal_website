"""Queries backing the catalog staleness refresh. SQLAlchemy only — the rules
about WHEN and WHAT to refresh live in services/catalog_refresh.py.

Every function here commits, unlike the rest of the repositories. The refresh
runs inside a read, around calls to IGDB and Wikipedia that can block for
seconds, and the one thing it must never do is hold a Postgres transaction open
across them (see the same rollback discipline in services/me.py). Committing
each step is what keeps the connection free while the network work happens.
"""

from datetime import UTC, date, datetime

from sqlalchemy import select, union, update
from sqlalchemy.orm import Session

from app.models import GameMetadata, PlayedGame, WishlistGame


def claim_for_refresh(db: Session, metadata_id: int, seen_stamp: datetime) -> bool:
    """Try to take ownership of one row's refresh. True if this caller won it.

    Claim first, fetch second: a lookup that times out or comes back empty was
    still an attempt, and stamping only on success would retry every read for as
    long as the third party stays unhelpful.

    Conditional on ``seen_stamp`` so a burst of concurrent readers -- who all sort
    the due rows identically and would otherwise pick the same one -- produces one
    winner. An unconditional stamp lets all of them through, fanning out at IGDB
    on the same credential the search proxy uses, where a throttle breaks adding
    games for everyone.

    Python's clock rather than func.now(): the staleness arithmetic is done in
    Python, and reading a server value back costs a round trip to settle
    milliseconds.
    """
    result = db.execute(
        update(GameMetadata)
        .where(GameMetadata.id == metadata_id, GameMetadata.refreshed_at == seen_stamp)
        .values(refreshed_at=datetime.now(UTC))
    )
    db.commit()
    return result.rowcount == 1


def apply_refresh(
    db: Session,
    metadata_id: int,
    *,
    release_date: date | None = None,
    platforms: list[str] | None = None,
    genres: list[str] | None = None,
    image_url: str | None = None,
) -> bool:
    """Write the values a refresh actually resolved. True if anything changed.

    None means "leave it alone": a lookup that found nothing must not blank a
    populated column. The guard is ``is not None``, so an empty list WOULD blank
    it -- callers send None instead, which is what the _*_to_write helpers in
    services/catalog_refresh.py are for.

    Takes an id and issues an UPDATE rather than mutating an ORM object: the row
    was loaded by the request's Session, and attaching it here would be two
    sessions owning one row.
    """
    values = {
        key: value
        for key, value in (
            ("release_date", release_date),
            ("platforms", platforms),
            ("genres", genres),
            ("image_url", image_url),
        )
        if value is not None
    }
    if not values:
        return False
    db.execute(update(GameMetadata).where(GameMetadata.id == metadata_id).values(**values))
    db.commit()
    return True


def recorded_systems(db: Session, metadata_id: int) -> set[str]:
    """Every console any user has recorded for this row, library and wishlist.

    Lets the refresh apply backfill_platforms.py's rule: a platform list omitting
    a console someone is playing on means the igdb_id landed on a variant (IGDB's
    "Dead Cells+" is Apple Arcade only).
    """
    played = select(PlayedGame.system).where(PlayedGame.metadata_id == metadata_id)
    wishlisted = select(WishlistGame.system).where(WishlistGame.metadata_id == metadata_id)
    rows = db.execute(union(played, wishlisted)).scalars()
    # wishlist_games.system is nullable — an entry that has not picked a console
    # contradicts nothing.
    return {system for system in rows if system}
