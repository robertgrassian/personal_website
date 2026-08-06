"""The IGDB proxy endpoint. HTTP concerns only, same layering as the other
routers.

Authenticated (any signed-in user) but not owner-scoped — searching costs
IGDB quota, not library state. Guarded by forbid_in_preview because the
proxy WRITES through its read path (token cache, rate-limit counters) and
preview deploys hold a read-only Postgres role.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.auth import CurrentUser
from app.core.config import API_PREFIX
from app.core.db import DbSession
from app.core.guards import forbid_in_preview
from app.schemas.igdb import IgdbSearchResponse
from app.services import igdb as igdb_service

router = APIRouter(prefix=API_PREFIX, tags=["igdb"])


@router.get("/igdb/search", dependencies=[Depends(forbid_in_preview)])
def search_igdb(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=100)],
    page: Annotated[int, Query(ge=1, le=igdb_service.MAX_PAGE)] = 1,
) -> IgdbSearchResponse:
    """Search IGDB for games matching ``q`` — feeds the add-game picker.

    ``page`` walks further down the same result list (the picker's "show
    more"), capped so paging can't be used to grind IGDB's quota. The response
    carries ``hasMore`` so the picker never has to infer it from page arithmetic.

    Status mapping:
    - 429 caller over their per-minute search budget
    - 502 Twitch/IGDB upstream failure
    - 503 credentials not configured in this environment
    """
    return igdb_service.search_games(db, user.id, q, page)
