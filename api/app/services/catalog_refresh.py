"""Keeping the shared catalog current, from the public read path.

A catalog row is written once, when the first person adds the game, and its
facts go stale: a wishlisted game gets an announced release date, a game ships
on another console, an infobox genre is corrected. Serving a library now
doubles as a slow repair pass, re-sourcing the couple of rows most out of date.

Four rules keep that from turning a page view into a fan-out at two third
parties. Only shared rows (``igdb_id IS NOT NULL``) -- a hand-entered row has
no canonical source. A row is due on a schedule, shorter when incomplete. At
most MAX_ROWS_PER_READ rows inside a wall-clock budget pushed down into the
HTTP timeouts. And the stamp is written before the lookups, conditionally
(repositories/catalog.py has the reasoning).

Never refreshed: the game's NAME. IGDB's title is frequently not this
library's, and the stored name is what the Wikipedia genre lookup searches on,
so overwriting it would break the genres of the row it just touched.

Only runs when a read reaches Postgres; the library pages are cached until a
write revalidates the tag. Bulk repair is still scripts/backfill_*.py.
"""

import logging
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.db import get_sessionmaker
from app.models import GameMetadata
from app.models.game import MAX_GENRE_LENGTH
from app.repositories import catalog as catalog_repo
from app.schemas.me import clean_genres, validate_igdb_image_url
from app.services import genres as genre_service
from app.services import igdb as igdb_service

logger = logging.getLogger(__name__)

# Platforms and genres both change after release, just slowly.
STALE_AFTER = timedelta(days=30)

# A hole is often permanent (an unannounced game HAS no date), so incompleteness
# shortens the interval rather than removing it. timedelta(0) for literal "always".
INCOMPLETE_RETRY_AFTER = timedelta(days=1)

# Per request. Enough to make progress without making a page feel slow; a badly
# drifted library catches up over several reads.
MAX_ROWS_PER_READ = 2

# Wall-clock ceiling, enforced by pushing what is left into each HTTP timeout.
# Checking the clock only BETWEEN legs bounds nothing: a leg starting at 1.4s
# with a 2s ceiling of its own still returns at 3.4s.
BUDGET = timedelta(seconds=1.5)

# Below this a leg would fail almost every real request while still costing the wait.
MIN_LEG = 0.3

# lookup_one makes two sequential requests, so its share is halved again.
WIKIPEDIA_CALLS = 2


def is_incomplete(meta: GameMetadata) -> bool:
    """Whether the catalog is missing something IGDB or Wikipedia could answer.

    Permanently true for a few rows: platforms stays empty on a variant row (see
    _platforms_to_write), and IGDB has no cover for plenty of games.
    """
    return not (meta.release_date and meta.genres and meta.platforms and meta.image_url)


def is_due(meta: GameMetadata, now: datetime) -> bool:
    if meta.igdb_id is None:
        return False
    interval = INCOMPLETE_RETRY_AFTER if is_incomplete(meta) else STALE_AFTER
    return now - meta.refreshed_at >= interval


def _due_rows(rows: list[GameMetadata], now: datetime) -> list[GameMetadata]:
    """The rows worth refreshing, worst first, capped.

    Two queues rather than one sorted list: permanently-incomplete rows come due
    every day, so a single incomplete-first list hands them every slot forever
    and no merely-stale row is ever refreshed. Half the slots are reserved for
    each queue, and an empty queue gives its slots to the other.

    Oldest first within a queue, so a library that is behind rotates through its
    rows instead of re-picking the same one.
    """
    due = sorted((r for r in rows if is_due(r, now)), key=lambda meta: meta.refreshed_at)
    incomplete = [meta for meta in due if is_incomplete(meta)]
    stale = [meta for meta in due if not is_incomplete(meta)]
    reserved = MAX_ROWS_PER_READ // 2
    picked = incomplete[:reserved] + stale[:reserved]
    # Whatever the reservation left unused, filled from either queue. Incomplete
    # first here: with both queues non-empty this never fires, so it only
    # decides how a one-sided library spends its slots.
    spare = incomplete[reserved:] + stale[reserved:]
    return (picked + spare)[:MAX_ROWS_PER_READ]


def _platforms_to_write(db: Session, meta: GameMetadata, fetched: list[str]) -> list[str] | None:
    """IGDB's platform list, or None to leave the column alone.

    Refuses a list omitting a console someone has recorded (backfill_platforms.py's
    rule): the contradiction means this igdb_id landed on a variant, not the base
    game. An empty column falls back to the owners' own systems, which beats a
    confident wrong answer.
    """
    if not fetched:
        return None
    missing = catalog_repo.recorded_systems(db, meta.id) - set(fetched)
    if missing:
        logger.info(
            "Catalog refresh skipped platforms for %r (igdb_id=%s): IGDB omits %s",
            meta.name,
            meta.igdb_id,
            sorted(missing),
        )
        return None
    return fetched if fetched != list(meta.platforms) else None


def _genres_to_write(fetched: list[str]) -> list[str] | None:
    """Wikipedia's genres, shaped the way an add would shape them, or None.

    Shaped rather than raw so a refreshed row and a freshly added one agree; a
    malformed infobox must not write what the create schemas would reject.

    An overwrite, not a fill-when-empty, so a hand-written genre correction is
    undone here. Corrections belong in the lookup instead (SOURCE_SYNONYMS /
    THEME_VALUES in services/genres.py, OVERRIDES in scripts/backfill_genres.py).
    """
    shaped = clean_genres([g for g in fetched if len(g) <= MAX_GENRE_LENGTH])
    return shaped or None


def _cover_to_write(meta: GameMetadata, fetched: str) -> str | None:
    """A cover only when the row has none.

    Not an overwrite: a row that already renders is not improved by whatever IGDB
    serves today, and the URL is hotlinked into pages. Validated rather than
    trusted, same rule that stops a library being used as image hosting.
    """
    if meta.image_url or not fetched:
        return None
    try:
        return validate_igdb_image_url(fetched)
    except ValueError:
        logger.warning("Catalog refresh rejected a non-IGDB cover URL for %r", meta.name)
        return None


def _remaining(deadline: float) -> float:
    return deadline - time.monotonic()


def _refresh_row(work: Session, meta: GameMetadata, deadline: float) -> bool:
    """Re-source one catalog row. True if anything was written.

    ``work`` is the refresh's own session; ``meta`` belongs to the request's and
    is only read from. The lookups swallow their own failures, so what escapes
    here is the database, which the caller catches.
    """
    if not catalog_repo.claim_for_refresh(work, meta.id, meta.refreshed_at):
        # Another reader is already refreshing this row, this second.
        return False

    igdb_budget = _remaining(deadline)
    facts = (
        igdb_service.lookup_game_facts(work, meta.igdb_id, timeout=igdb_budget)
        if igdb_budget >= MIN_LEG
        else None
    )
    # The token read autobegan a transaction; end it rather than let it span the
    # Wikipedia call. Safe only because this is the work session: a rollback on
    # the request's would expire every loaded row (see refresh_stale_rows).
    work.rollback()

    # Two more requests, so this is what gets dropped when IGDB ate the budget:
    # the row loses its genres until it next comes due, which beats a page that
    # fails to render.
    wiki_genres: list[str] = []
    wiki_budget = _remaining(deadline) / WIKIPEDIA_CALLS
    if wiki_budget >= MIN_LEG:
        wiki_genres = genre_service.lookup_one(meta.name, timeout=wiki_budget)

    return catalog_repo.apply_refresh(
        work,
        meta.id,
        # A game IGDB has no date for keeps the one it has; a date IGDB has
        # MOVED is taken, which is the delayed-release case.
        release_date=facts.release_date if facts else None,
        platforms=_platforms_to_write(work, meta, facts.platforms) if facts else None,
        image_url=_cover_to_write(meta, facts.cover_url) if facts else None,
        genres=_genres_to_write(wiki_genres),
    )


def refresh_stale_rows(db: Session, rows: list[GameMetadata]) -> None:
    """Re-source the most out-of-date rows among the ones this read loaded.

    ``db`` is the request's session, borrowed for one thing: expiring the rows
    this changed, so the response reads the new values rather than showing them
    a request late (the reads are cached, so a miss may not be asked for again
    for a long time).

    Everything else runs on a session of its own, because the refresh must end
    its transaction before calling Wikipedia and Session.rollback() expires the
    whole identity map -- `expire_on_commit=False` does not cover it. On the
    request's session that would expire all ~155 loaded rows and turn building
    the response into an N+1. It also keeps a failure here from poisoning the
    request's session.
    """
    due = _due_rows(rows, datetime.now(UTC))
    if not due:
        # The overwhelming majority of reads. Nothing above this line has
        # touched the network or the database.
        return
    deadline = time.monotonic() + BUDGET.total_seconds()
    with get_sessionmaker()() as work:
        for meta in due:
            if _remaining(deadline) < MIN_LEG:
                return
            # Captured up front: on the failure path meta may be unreadable, and
            # a logger call that lazy-loads an attribute would raise from inside
            # the handler meant to contain the failure.
            name, row_id = meta.name, meta.id
            try:
                if _refresh_row(work, meta, deadline):
                    db.expire(meta)
            except Exception:
                # Broad on purpose: optional repair work riding on someone's page
                # load must degrade to "not refreshed" rather than 500 a public
                # library.
                logger.exception("Catalog refresh failed for %r (id=%s)", name, row_id)
                return
