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

**At most MAX_ROWS_PER_READ rows, inside a wall-clock budget.** The caller here
is a Server Component render with a five-second abort (REQUEST_TIMEOUT_MS in
src/lib/libraryApi.ts), and blowing that budget does not degrade the page, it
fails it. The budget is checked before each row AND before the Wikipedia leg of
one, so a slow IGDB costs the genre lookup rather than the page.

**The stamp is written before the lookups, not after** (repositories/catalog.py
explains why). So a failure is an attempt, and the worst a wedged third party
can do is cost one row's timeout per read.

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

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

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

# Wall-clock ceiling on the whole refresh, checked before each outbound leg.
# Well under the caller's five-second abort, since the library query and the
# JSON serialization also have to fit inside it.
BUDGET = timedelta(seconds=1.5)

# Per-request ceilings for the two third parties, tighter than their defaults
# (10s and 8s) for the same reason: those are sized for a browser waiting on a
# search box, not for a page render that has already spent part of its budget.
IGDB_TIMEOUT = 2.0
WIKIPEDIA_TIMEOUT = 2.0


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

    Incomplete before merely old: a missing release date is a visible hole in
    the page, while a stale platform list is a detail on the back of a case.
    Oldest check first within each group, so a library that is behind rotates
    through its rows instead of re-picking the same one every read.
    """
    due = [meta for meta in rows if is_due(meta, now)]
    due.sort(key=lambda meta: (not is_incomplete(meta), meta.refreshed_at))
    return due[:MAX_ROWS_PER_READ]


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


def _refresh_row(db: Session, meta: GameMetadata, deadline: float) -> None:
    """Re-source one catalog row.

    The two lookups swallow their own failures, so what can still escape here
    is the database. The caller catches it: this rides on a public read, and a
    failed repair must not turn someone's library into a 500.
    """
    catalog_repo.claim_for_refresh(db, meta)

    facts = igdb_service.lookup_game_facts(db, meta.igdb_id, timeout=IGDB_TIMEOUT)
    # Ends the transaction the claim's commit left autobegun by the lookup's
    # token read, so the Wikipedia call below does not span an open one.
    db.rollback()

    # The genre leg is two more requests, so it is the part that gets dropped
    # when IGDB has already eaten the budget. Skipping it costs this row its
    # genres until the next time it comes due, which is the cheap half of the
    # trade against failing the page.
    wiki_genres: list[str] = []
    if time.monotonic() < deadline:
        wiki_genres = genre_service.lookup_one(meta.name, timeout=WIKIPEDIA_TIMEOUT)

    catalog_repo.apply_refresh(
        db,
        meta,
        # A game IGDB has no date for keeps the one it has; a date IGDB has
        # MOVED is taken, which is the delayed-release case.
        release_date=facts.release_date if facts else None,
        platforms=_platforms_to_write(db, meta, facts.platforms) if facts else None,
        image_url=_cover_to_write(meta, facts.cover_url) if facts else None,
        genres=_genres_to_write(wiki_genres),
    )


def refresh_stale_rows(db: Session, rows: list[GameMetadata]) -> None:
    """Re-source the most out-of-date rows among the ones this read loaded.

    Mutates the passed rows in place, so the response being composed carries
    the new values rather than showing them a request late. That matters more
    than it looks: the library reads are cached until a write revalidates their
    tag, so a value that misses this response may not be asked for again for a
    long time.
    """
    now = datetime.now(UTC)
    deadline = time.monotonic() + BUDGET.total_seconds()
    for meta in _due_rows(rows, now):
        if time.monotonic() >= deadline:
            return
        try:
            _refresh_row(db, meta, deadline)
        except Exception:
            # Broad on purpose, and the same rule the lookups themselves follow:
            # this is optional repair work riding on someone's page load, so a
            # database error or a bug in here must degrade to "not refreshed"
            # rather than turning a public library into a 500.
            logger.exception("Catalog refresh failed for %r (id=%s)", meta.name, meta.id)
            try:
                db.rollback()
            except SQLAlchemyError:
                logger.exception("Rollback after a failed catalog refresh also failed")
                return
