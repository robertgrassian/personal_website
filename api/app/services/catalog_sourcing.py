"""What a game being added gets on its catalog row, and the preview of it.

A new SHARED row (one with an igdb_id) is built from IGDB and Wikipedia, never
from the add payload; a hand-entered row keeps what its owner sent. The add
path (services/me.py) and the add form's preview both resolve through this
module, so the two cannot disagree about the rule.

Sibling of services/catalog_refresh.py, which repairs rows that already exist.
"""

import logging
import uuid
from datetime import date, timedelta
from typing import NamedTuple

from fastapi import status
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser
from app.core.errors import DomainError
from app.models import GameMetadata
from app.models.game import MAX_GENRE_LENGTH
from app.repositories import me as me_repo
from app.schemas.me import CatalogPreview, clean_genres
from app.services import genres as genre_service
from app.services import igdb as igdb_service
from app.services import rate_limit

logger = logging.getLogger(__name__)


class UnknownIgdbGameError(DomainError):
    """The add named an igdb_id IGDB has never issued. No honest client can
    send one, since the id comes from a search result."""

    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT

    def __init__(self, igdb_id: int) -> None:
        super().__init__(f"IGDB has no game with id {igdb_id}.")


class CatalogUnverifiedError(DomainError):
    """IGDB could not confirm a game that would create a new shared catalog
    row. Refused rather than built from the payload, which is what this check
    exists to stop."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    def __init__(self) -> None:
        super().__init__("Couldn't confirm this game with IGDB right now. Try again in a moment.")


class _NewCatalogFields(NamedTuple):
    """The catalog values an add stores if it creates a row, rather than
    trusting the payload for them."""

    name: str
    genres: list[str]
    release_date: date | None
    image_url: str | None
    platforms: list[str]
    platform_release_dates: dict[str, str | None]


def fields_for_new_catalog_row(
    db: Session,
    *,
    user_id: uuid.UUID,
    igdb_id: int | None,
    name: str,
    system: str | None,
    genres: list[str],
    release_date: date | None,
    image_url: str | None,
) -> _NewCatalogFields | None:
    """The values to store for a game being added, if its row is new. None
    when an existing SHARED row answers, which catalog_row_for_add adopts.

    A row with an igdb_id is SHARED, so everything on it comes from IGDB and
    Wikipedia and nothing from the payload: otherwise whoever adds a game first
    names it for everyone, and no UI path edits a shared row afterwards. The
    id is the one thing taken on trust, and the IGDB fetch is what checks it.
    That is the call that used to fetch only platforms, so verifying costs no
    extra request. A hand-entered row is private and keeps what its owner sent.

    Genres come from Wikipedia: IGDB's genre field is too coarse to describe a
    library (Hades II with no roguelike anywhere), and Wikipedia's infoboxes
    are where the shelves' existing vocabulary came from. See services/genres.py.

    All skipped when the catalog row already exists: find_or_create_metadata
    returns that row untouched, so anything sourced here would be discarded.
    That is the common case, and it costs nothing.
    """
    from_client = _NewCatalogFields(
        name=name,
        genres=genres,
        release_date=release_date,
        image_url=image_url,
        platforms=[],
        platform_release_dates={},
    )
    if me_repo.find_metadata(db, user_id=user_id, igdb_id=igdb_id, name=name) is not None:
        # Not the payload for a shared row, even as values to be discarded: if
        # the row vanished before the insert, they would be what got stored.
        return None if igdb_id is not None else from_client
    # End the read transaction the queries above opened, before calls that can
    # block for seconds. SQLAlchemy autobegins on the first statement, so
    # "nothing has been written yet" does NOT mean "no transaction is open" —
    # under NullPool and a transaction-mode pooler, that would hold a pooler
    # connection idle-in-transaction for the whole round trip. The writes below
    # autobegin a fresh one.
    db.rollback()
    if igdb_id is None:
        return from_client._replace(
            genres=_sourced_genres(igdb_id=None, name=name, fallback=genres)
        )
    game = _verified_igdb_game(db, igdb_id)
    platforms = _platforms_for_new_catalog_row(db, game.platforms, system=system)
    # IGDB before Wikipedia, with a rollback between: the IGDB leg reads the
    # cached Twitch token out of Postgres, and rolling back after it keeps that
    # read from spanning the Wikipedia call as well.
    db.rollback()
    return _NewCatalogFields(
        name=game.name,
        # IGDB's genres, not the payload's, are the fallback when Wikipedia misses.
        genres=_sourced_genres(igdb_id=igdb_id, name=game.name, fallback=game.genres),
        release_date=game.release_date,
        image_url=game.cover_url or None,
        platforms=platforms,
        platform_release_dates=game.platform_release_dates,
    )


def catalog_row_for_add(
    db: Session,
    *,
    user_id: uuid.UUID,
    igdb_id: int | None,
    name: str,
    sourced: _NewCatalogFields | None,
) -> GameMetadata:
    """The catalog row an add links to: the existing one, or one created from
    `sourced`. `name` is the payload's, used only as a hand-entered row's key."""
    if sourced is None:
        meta = me_repo.find_metadata(db, user_id=user_id, igdb_id=igdb_id, name=name)
        if meta is None:
            # Deleted since fields_for_new_catalog_row saw it. Nothing verified
            # is in hand to rebuild it from; a retry fetches it from IGDB.
            raise CatalogUnverifiedError()
        return meta
    return me_repo.find_or_create_metadata(
        db,
        user_id=user_id,
        igdb_id=igdb_id,
        name=sourced.name,
        genres=sourced.genres,
        release_date=sourced.release_date,
        image_url=sourced.image_url,
        platforms=sourced.platforms,
        platform_release_dates=sourced.platform_release_dates,
    )


def _verified_igdb_game(db: Session, igdb_id: int) -> igdb_service.IgdbCatalogGame:
    """IGDB's record for the id, or the error that refuses the add."""
    try:
        game = igdb_service.fetch_catalog_game(db, igdb_id)
    except (igdb_service.IgdbNotConfiguredError, igdb_service.IgdbUpstreamError) as exc:
        logger.warning("Could not verify IGDB id %s for a new catalog row: %s", igdb_id, exc)
        raise CatalogUnverifiedError() from exc
    if game is None:
        raise UnknownIgdbGameError(igdb_id)
    return game


def _platforms_for_new_catalog_row(
    db: Session, platforms: list[str], *, system: str | None
) -> list[str]:
    """IGDB's platform list for the game, or [] where the caller's console
    contradicts it.

    Both columns speak IGDB's platform vocabulary (migration d1a83f6c25e7), so
    a console missing from the list means this igdb_id landed on a variant
    rather than the base game — IGDB's "Dead Cells+" is Apple Arcade only. This
    column answers "which consoles are valid for this game?", and an answer
    omitting the owner's own console is worse than no answer: [] falls back to
    the union of their existing systems at read time. Same rule
    scripts/backfill_platforms.py applies when it skips such a row.

    Only a real IGDB platform name can contradict the list, though. Free text
    says nothing about which game the id is, and letting it blank the column
    would be the payload shaping a shared row after all. Unknown (the platform
    list is unavailable) keeps the cautious [].
    """
    if not system or system in platforms:
        return platforms
    if igdb_service.is_platform_name(db, system) is False:
        return platforms
    return []


def _sourced_genres(*, igdb_id: int | None, name: str, fallback: list[str]) -> list[str]:
    """The genres for a catalog row that does not exist yet. Split out of
    fields_for_new_catalog_row so preview_catalog_entry decides the same way an
    add does.

    Two cases skip the lookup, and neither is an error: a hand-entered game
    whose genres the caller typed (a private row is theirs to name, and
    overriding it would be the silent discard this path exists to avoid), and
    a Wikipedia miss or outage, which falls back to `fallback` rather than
    failing the add. For an IGDB game the add passes IGDB's genres as the
    fallback, never the payload's; only the preview passes the payload.

    Both of those exits carry fallback genres, and both put them on the
    pipeline's spelling first. Without that, the only rows in the catalog that
    skip normalize_genre are the hand-typed ones, and they diverge visibly:
    prod held "Beat 'em up" and "Shoot 'em Up" side by side, and six genres
    across sixteen games were cased the way someone typed them rather than the
    way every other row is.

    Note what that does and does not buy: the two share this implementation, so
    they cannot disagree about the RULE, but each makes its own Wikipedia call,
    so a lookup that succeeds for the preview and times out for the add will
    still store something the popover did not show. Nothing short of caching
    the result fixes that, and a serverless function has nowhere to cache it.
    """
    fallback = _normalized_fallback(fallback)
    if igdb_id is None and fallback:
        return fallback
    # Two outbound requests on the slowest add there is: a game nobody has
    # entered before. Bounded by lookup_one, which never raises and skips the
    # Wikidata leg.
    sourced = _shaped_genres(genre_service.lookup_one(name))
    # Shaping first, emptiness second. The other order looks equivalent and is
    # not: a single over-long infobox genre is a truthy lookup that shapes down
    # to nothing, which would then be stored as "no genres" instead of falling
    # back to what the client sent.
    return sourced or fallback


def _normalized_fallback(genres: list[str]) -> list[str]:
    """Fallback genres (typed, or IGDB's) put on the spelling the Wikipedia
    path produces.

    Casing only. A value normalize_genre rejects outright -- a THEME_VALUES
    entry -- is kept rather than dropped, because not silently discarding what
    the caller typed is the reason this fallback exists. So the
    theme block list still does not bite a hand-typed add; that is a separate
    decision, tracked in docs/todo/genre-vocabulary-audit.md.
    """
    return _shaped_genres([genre_service.normalize_genre(g) or g for g in genres])


def _shaped_genres(genres: list[str]) -> list[str]:
    """Genres shaped the way a create schema would shape them. Values reaching
    the catalog from Wikipedia or a query string never pass through
    GameCreate, so the trim/dedupe/cap it applies is applied here instead.
    Over-long values are dropped rather than raising, because a malformed
    infobox must not fail an add."""
    return clean_genres([g for g in genres if len(g) <= MAX_GENRE_LENGTH])


# Its own bucket rather than the shared "writes" one: this is a read, and it
# can fan out to Wikipedia, so it needs a budget of its own. Sized like
# igdb_search, which the add flow calls immediately before it.
PREVIEW_RATE_LIMIT_BUCKET = "catalog_preview"
PREVIEW_RATE_LIMIT_MAX = 30
PREVIEW_RATE_LIMIT_WINDOW = timedelta(seconds=60)


def preview_catalog_entry(
    db: Session,
    user: AuthenticatedUser,
    *,
    name: str,
    igdb_id: int | None,
    genres: list[str],
    release_date: date | None,
) -> CatalogPreview:
    """The catalog values this game would end up with if it were added now.

    Answers the add form's "what is this game, actually?" without adding it.
    The point is that it resolves the SAME way the write path does rather than
    just looking genres up: a game whose catalog row already exists keeps that
    row's genres and release date, so a preview showing a fresh Wikipedia
    answer would be showing something the add will not store. Nothing here
    writes, beyond the rate-limit counter charged below.

    One place it does NOT follow the add: it never asks IGDB, so for a new IGDB
    row it answers from the payload's name, genres and date where the add uses
    IGDB's. The two agree because the form posts a search result verbatim; an
    extra IGDB call per preview would buy nothing for that client.
    """
    rate_limit.enforce(
        db,
        user.id,
        PREVIEW_RATE_LIMIT_BUCKET,
        PREVIEW_RATE_LIMIT_MAX,
        PREVIEW_RATE_LIMIT_WINDOW,
        f"Too many game lookups: limited to {PREVIEW_RATE_LIMIT_MAX} per minute. "
        "Wait a moment and try again.",
    )
    existing = me_repo.find_metadata(db, user_id=user.id, igdb_id=igdb_id, name=name)
    if existing is not None:
        return CatalogPreview(genres=existing.genres, release_date=existing.release_date)
    # Same reason as the add path: do not hold a transaction open across the
    # lookup. rate_limit.enforce above commits its own, and find_metadata
    # reopened one.
    db.rollback()
    return CatalogPreview(
        # The client's genres are shaped before they are used as the fallback,
        # because the write path shapes them too (via GameCreate). Skipping it
        # here would let the popover show "RPG, rpg" for a row that will store
        # one of them.
        genres=_sourced_genres(igdb_id=igdb_id, name=name, fallback=_shaped_genres(genres)),
        release_date=release_date,
    )
