"""Keeping the shared catalog current, from the public read path.

A catalog row is written once, when the first person adds the game, and the
facts on it do not stay true. A game wishlisted before it had a release date
gets one announced. A game ships on a console it was not on. An infobox genre
is corrected. Until this module existed the only cure was running
scripts/backfill_*.py by hand, so a library was as accurate as the last time
its owner remembered to.

So a read now doubles as a slow repair pass: while serving a library, it
re-sources a couple of the rows that are most out of date. Four rules keep
that from turning a page view into a fan-out to two third parties.

**Only shared rows.** ``igdb_id IS NULL`` means a hand-entered PRIVATE row (see
models/game_metadata). There is no canonical source for a game IGDB has never
heard of, and its genres are whatever its owner typed -- which the add path
already declines to overwrite, so this does too.

**A row is due on a schedule, and an incomplete row on a much shorter one.**
Anything missing a release date, genres, platforms or cover art is re-checked
every INCOMPLETE_RETRY_AFTER; a row with all four is left alone for
STALE_AFTER. The obvious rule -- always retry a row with a hole in it,
ignoring the timestamp -- was rejected because the hole is often permanent: an
unannounced game HAS no release date, so "always" means every uncached page
view pays two network round trips forever, for a value that does not exist
yet. A day still notices an announcement about 364 times sooner than anyone
would by hand. Set INCOMPLETE_RETRY_AFTER to timedelta(0) for literal "always".

**At most MAX_ROWS_PER_READ rows, inside a wall-clock budget that is really
enforced.** The caller is a Server Component render with a five-second abort
(REQUEST_TIMEOUT_MS in src/lib/libraryApi.ts), and overrunning it does not
degrade the page, it fails it -- and aborting the fetch does not stop this
function, so the server finishes the work for a page nobody will see. What is
left of the budget is therefore divided up and handed to each HTTP call as its
own timeout, rather than merely consulted between calls: a leg starting at 1.4s
with a 2s ceiling of its own returns at 3.4s, which bounds nothing. The IGDB
leg additionally refuses to mint a Twitch token, since that call carries a
ten-second ceiling no timeout argument reaches.

**The stamp is written before the lookups, and conditionally**
(repositories/catalog.py explains both). So a failure is an attempt, and a
burst of simultaneous readers -- who all sort the due rows identically and
would otherwise all pick the same one -- produces a single winner rather than a
fan-out at IGDB.

What is NOT refreshed, deliberately: the game's NAME. IGDB's title is often not
this library's (scripts/backfill_titles.py is the hand-checked list of where it
is wrong), and the stored name is the string the Wikipedia genre lookup
searches on -- so "correcting" it from IGDB would break the genres of the row
it just touched.

Note this only ever runs when a read reaches Postgres at all. The library pages
cache their fetches until a write revalidates the tag, so a library nobody
edits and nobody visits does not quietly refresh in the background. Bulk
repair is still scripts/backfill_genres.py and scripts/backfill_platforms.py;
this is the trickle that keeps an active library from drifting in the first
place.
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

# A row with every field filled in is still re-checked this often: platforms
# and genres both change after release, just slowly.
STALE_AFTER = timedelta(days=30)

# A row missing any of the four sourced fields. Short, because the missing
# value is the one most likely to have appeared since -- and because a
# wishlisted game with no release date is the case this whole module was asked
# for.
INCOMPLETE_RETRY_AFTER = timedelta(days=1)

# Per request, across the whole library. Two is enough to make progress on
# every read without ever making a page feel slow; a library that has drifted
# badly catches up over several reads, or in one pass with the backfill
# scripts.
MAX_ROWS_PER_READ = 2

# Wall-clock ceiling on the whole refresh. Real rather than advisory: what is
# left of it is divided up and pushed into the HTTP calls as their timeouts, so
# the ceiling holds even when both third parties hang. Checking the clock
# BETWEEN legs, which is what this did first, bounds nothing at all -- a leg
# that starts at 1.4s with a 2s timeout of its own still returns at 3.4s.
BUDGET = timedelta(seconds=1.5)

# Below this there is no point starting a leg: a sub-300ms timeout would fail
# almost every real request while still costing the wait.
MIN_LEG = 0.3

# lookup_one makes two sequential requests (search, then lead sections), so its
# share is halved again to bound the leg rather than one call inside it.
WIKIPEDIA_CALLS = 2


def is_incomplete(meta: GameMetadata) -> bool:
    """Whether the catalog is missing something it could know about this game.

    All four fields are things IGDB or Wikipedia can answer. Note platforms is
    legitimately empty on a row whose igdb_id points at a variant (see
    _platforms_to_write), so this can be true forever for a handful of rows --
    which is exactly why incompleteness shortens the interval rather than
    removing it.
    """
    return not (meta.release_date and meta.genres and meta.platforms and meta.image_url)


def is_due(meta: GameMetadata, now: datetime) -> bool:
    if meta.igdb_id is None:
        return False
    interval = INCOMPLETE_RETRY_AFTER if is_incomplete(meta) else STALE_AFTER
    return now - meta.refreshed_at >= interval


def _due_rows(rows: list[GameMetadata], now: datetime) -> list[GameMetadata]:
    """The rows worth refreshing, worst first, capped.

    Two queues rather than one sorted list, and that is the whole point. Some
    rows are incomplete PERMANENTLY -- a variant row's platforms stay empty by
    design, IGDB has no cover for plenty of games, a title Wikipedia cannot
    resolve confidently never gets genres. Those come due again every day, so a
    single list sorted incomplete-first hands them every slot forever and no
    merely-stale row is ever refreshed at all. Reserving half the slots for each
    queue means neither can starve the other; whichever queue is empty gives its
    slots to the other.

    Oldest check first within each queue, so a library that is behind rotates
    through its rows instead of re-picking the same one every read.
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

    Refuses a list that omits a console someone has actually recorded for this
    game, which is scripts/backfill_platforms.py's rule and for its reason: the
    contradiction means this row's igdb_id landed on a variant rather than the
    base game, and storing the variant's platforms would drop the real console
    out of "which systems are valid here?". An empty column falls back to the
    owners' own systems at read time, which is a better answer than a confident
    wrong one.
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

    Shaped rather than stored raw because a refreshed row and a freshly added
    one must agree: services/me.py runs the same trim/dedupe/cap over what the
    lookup returns, and a malformed infobox must not write a value the create
    schemas would have rejected.

    An overwrite, not a fill-when-empty, because "the genres were updated" is
    half of what this module was asked for. That does mean a hand-written
    correction to a row's genres will be undone here -- so a correction has to
    live in the lookup (SOURCE_SYNONYMS / THEME_VALUES in services/genres.py,
    or OVERRIDES in scripts/backfill_genres.py), which is where
    docs/todo/genre-vocabulary-audit.md had already concluded it belongs.
    """
    shaped = clean_genres([g for g in fetched if len(g) <= MAX_GENRE_LENGTH])
    return shaped or None


def _cover_to_write(meta: GameMetadata, fetched: str) -> str | None:
    """A cover only when the row has none.

    Deliberately not an overwrite: a row that already renders is not improved
    by swapping in whatever IGDB is serving today, and the URL is hotlinked
    into pages. Validated anyway rather than trusted, so the same rule that
    stops an account using its library as image hosting applies to what IGDB
    hands back.
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

    ``work`` is the refresh's OWN session, never the request's -- see
    refresh_stale_rows. ``meta`` belongs to the request's session and is read
    from, never written to or attached here.

    The two lookups swallow their own failures, so what can still escape here
    is the database. The caller catches it: this rides on a public read, and a
    failed repair must not turn someone's library into a 500.
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
    # The token read above autobegan a transaction on the work session; end it
    # rather than letting it span the Wikipedia call. Safe here in a way it was
    # not on the request's session, where a rollback expires every loaded row
    # and turns the response build into an N+1 over the whole library.
    work.rollback()

    # The genre leg is two more requests, so it is what gets dropped when IGDB
    # has already eaten the budget. Skipping it costs this row its genres until
    # it next comes due, which is the cheap half of the trade against a page
    # that fails to render.
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

    ``db`` is the request's session, and this borrows it for exactly one thing:
    expiring the rows it changed, so the response being composed reads the new
    values rather than showing them a request late. That matters more than it
    looks, because the library reads are cached until a write revalidates their
    tag: a value that misses this response may not be asked for again for a
    long time.

    Everything else happens on a SESSION OF ITS OWN. The refresh has to end its
    transaction before calling Wikipedia, and Session.rollback() expires every
    object in its identity map -- `expire_on_commit=False` does not cover it.
    On the request's session that would silently expire all ~155 loaded rows
    mid-request, so building the response would reload each of them one at a
    time. A separate session also means a failure in here cannot leave the
    request's session poisoned for the queries that follow.
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
            # Captured before the work starts: on the failure path below, meta
            # may be unreadable, and a logger call that lazy-loads an attribute
            # would raise from inside the handler meant to contain the failure.
            name, row_id = meta.name, meta.id
            try:
                if _refresh_row(work, meta, deadline):
                    db.expire(meta)
            except Exception:
                # Broad on purpose, and the same rule the lookups themselves
                # follow: this is optional repair work riding on someone's page
                # load, so a database error or a bug in here must degrade to
                # "not refreshed" rather than turning a public library into a
                # 500. The work session is discarded either way.
                logger.exception("Catalog refresh failed for %r (id=%s)", name, row_id)
                return
