"""The shared game catalog's read surface: search, and the preview of what a
catalog row would hold.

Both routes are authenticated (any signed-in user) but NOT owner-scoped, so
neither belongs under /me: they answer questions about games, not about the
caller. Searching costs IGDB quota rather than library state, and the preview
describes a catalog row that is shared between everyone who owns that game.

The URLs deliberately do not name IGDB. It is the supplier behind the search,
not the resource being served, and a path that names it would have to change
the day a second source is added. The vendor name stays in services/igdb.py
and repositories/igdb.py, which genuinely are IGDB clients.

Both are guarded by forbid_in_preview because both WRITE through their read
path (the token cache, their rate-limit counters) and preview deploys hold a
read-only Postgres role.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.auth import CurrentUser
from app.core.db import DbSession
from app.core.guards import forbid_in_preview
from app.models.game import MAX_GENRES
from app.schemas.igdb import IgdbSearchResponse
from app.schemas.me import CatalogPreview
from app.services import igdb as igdb_service
from app.services import me as me_service

router = APIRouter(tags=["catalog"])


@router.get("/game-catalog", dependencies=[Depends(forbid_in_preview)])
def search_catalog(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=100)],
    page: Annotated[int, Query(ge=1, le=igdb_service.MAX_PAGE)] = 1,
) -> IgdbSearchResponse:
    """Search the catalog for games matching ``q`` — feeds the add-game picker.

    A query on a collection rather than a /search verb, and ``q`` is required
    because the collection is IGDB's and cannot be enumerated.

    ``page`` walks further down the same result list (the picker's "show
    more"), capped so paging can't be used to grind IGDB's quota. The response
    carries ``hasMore`` so the picker never has to infer it from page arithmetic.

    Status mapping:
    - 429 caller over their per-minute search budget
    - 502 Twitch/IGDB upstream failure
    - 503 credentials not configured in this environment
    """
    return igdb_service.search_games(db, user.id, q, page)


@router.get("/game-catalog/preview", dependencies=[Depends(forbid_in_preview)])
def preview_catalog_entry(
    user: CurrentUser,
    db: DbSession,
    name: Annotated[str, Query(min_length=1, max_length=200)],
    # Explicit aliases, because CamelModel's camelCase convention covers SCHEMA
    # fields and not bare query params: without these the parameters are named
    # igdb_id / release_date on the wire, FastAPI silently ignores the client's
    # camelCase spelling, and the preview runs as though the game had no IGDB id
    # and no release date. That shipped once; do not remove them.
    igdb_id: Annotated[int | None, Query(alias="igdbId")] = None,
    genres: Annotated[list[str], Query(max_length=MAX_GENRES)] = [],  # noqa: B006 (FastAPI reads the default, never mutates it)
    release_date: Annotated[date | None, Query(alias="releaseDate")] = None,
) -> CatalogPreview:
    """The catalog values a game would carry if it were added right now.

    A GET rather than part of the add response, because the add form shows this
    before anything is created. `genres` and `releaseDate` are what the client
    already has from IGDB: the same fallbacks the write path would use, passed
    in so this answers with exactly what an add would store rather than with a
    second opinion.

    The service function stays in services/me.py even though this route does
    not: it shares the genre-resolution helpers with the add path on purpose, so
    the preview and the write cannot disagree about the rule. Splitting the
    module would separate them.

    Status mapping:
    - 429 caller over their per-minute lookup budget
    """
    return me_service.preview_catalog_entry(
        db,
        user,
        name=name,
        igdb_id=igdb_id,
        genres=genres,
        release_date=release_date,
    )
