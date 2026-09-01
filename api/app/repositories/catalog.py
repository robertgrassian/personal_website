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

    Claim first, fetch second, for two reasons that are really the same one.
    A lookup that times out, 502s or comes back empty has still been an
    attempt, and a row that is not stamped until it succeeds would be retried
    on every read for as long as the third party stays unhelpful -- which for
    an unannounced release date could be years. And every concurrent reader of
    a library sorts the due rows identically, so without a claim they would all
    pick the same row and all pay for it.

    Conditional on ``seen_stamp`` for that second reason: the UPDATE only
    matches if the row still carries the value this caller read, so a burst of
    simultaneous readers produces exactly one winner and the losers move on.
    An unconditional stamp would let all of them through, turning one page view
    into an unbounded fan-out at IGDB -- on the same app credential the
    authenticated search proxy uses, where a throttle breaks adding games for
    everyone.

    Python's clock rather than func.now(), unlike the created_at default: the
    staleness arithmetic is done in Python against datetime.now(UTC), and
    reading a server-generated value back would cost a second round trip to
    settle a difference of milliseconds.
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

    None means "leave it alone", which is why every parameter defaults to it: a
    lookup that found nothing must not blank a column that already holds
    something. Note the guard is ``is not None``, so passing an empty list WOULD
    blank the column -- every caller is responsible for sending None instead,
    which is what the _*_to_write helpers in services/catalog_refresh.py are for.

    Takes an id and issues an UPDATE rather than mutating an ORM object,
    because the row this writes was loaded by somebody else's Session (the
    request's) and attaching it here would be two sessions owning one row.
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
    """Every console any user has recorded for this catalog row, across the
    library and the wishlist.

    The refresh needs this to apply the same rule scripts/backfill_platforms.py
    applies: a platform list that omits a console someone is playing the game on
    means the row's igdb_id landed on a variant (IGDB's "Dead Cells+" is Apple
    Arcade only), and writing it would remove that console from the answer to
    "which systems are valid for this game?".
    """
    played = select(PlayedGame.system).where(PlayedGame.metadata_id == metadata_id)
    wishlisted = select(WishlistGame.system).where(WishlistGame.metadata_id == metadata_id)
    rows = db.execute(union(played, wishlisted)).scalars()
    # wishlist_games.system is nullable — an entry that has not picked a console
    # contradicts nothing.
    return {system for system in rows if system}
