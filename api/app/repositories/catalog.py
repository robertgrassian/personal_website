"""Queries backing the catalog staleness refresh. SQLAlchemy only — the rules
about WHEN and WHAT to refresh live in services/catalog_refresh.py.

Every function here commits, unlike the rest of the repositories. The refresh
runs inside a read, around calls to IGDB and Wikipedia that can block for
seconds, and the one thing it must never do is hold a Postgres transaction open
across them (see the same rollback discipline in services/me.py). Committing
each step is what keeps the connection free while the network work happens.
"""

from datetime import UTC, date, datetime

from sqlalchemy import select, union
from sqlalchemy.orm import Session

from app.models import GameMetadata, PlayedGame, WishlistGame


def claim_for_refresh(db: Session, meta: GameMetadata) -> datetime:
    """Stamp ``refreshed_at`` = now and commit, BEFORE the lookups run.

    Claim first, fetch second, for two reasons that are really the same one.
    A lookup that times out, 502s or comes back empty has still been an
    attempt, and a row that is not stamped until it succeeds would be retried
    on every read for as long as the third party stays unhelpful -- which for
    an unannounced release date could be years. And two concurrent readers of
    the same library would otherwise both pick the same due row and both pay
    for it.

    Python's clock rather than func.now(), unlike the created_at default: the
    staleness arithmetic is done in Python against datetime.now(UTC), and
    reading a server-generated value back would cost a second round trip to
    settle a difference of milliseconds.
    """
    stamped = datetime.now(UTC)
    meta.refreshed_at = stamped
    db.commit()
    return stamped


def apply_refresh(
    db: Session,
    meta: GameMetadata,
    *,
    release_date: date | None = None,
    platforms: list[str] | None = None,
    genres: list[str] | None = None,
    image_url: str | None = None,
) -> None:
    """Write the values a refresh actually resolved. None means "leave it
    alone", which is why every parameter defaults to it: a lookup that found
    nothing must not blank a column that already holds something.
    """
    if release_date is not None:
        meta.release_date = release_date
    if platforms is not None:
        meta.platforms = platforms
    if genres is not None:
        meta.genres = genres
    if image_url is not None:
        meta.image_url = image_url
    db.commit()


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
