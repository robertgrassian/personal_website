"""The IGDB proxy endpoint. HTTP concerns only, same layering as the other
routers.

Authenticated (any signed-in user) but not owner-scoped — searching costs
IGDB quota, not library state. Guarded by forbid_in_preview because the
proxy WRITES through its read path (token cache, rate-limit counters) and
preview deploys hold a read-only Postgres role.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser
from app.core.config import API_PREFIX
from app.core.db import get_db
from app.core.guards import forbid_in_preview
from app.schemas.igdb import IgdbSearchResult
from app.services import igdb as igdb_service
from app.services.igdb import IgdbNotConfiguredError, IgdbUpstreamError, RateLimitedError

router = APIRouter(prefix=API_PREFIX, tags=["igdb"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/igdb/search", dependencies=[Depends(forbid_in_preview)])
def search_igdb(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=100)],
) -> list[IgdbSearchResult]:
    """Search IGDB for games matching ``q`` — feeds the add-game picker.

    Status mapping:
    - 429 caller over their per-minute search budget
    - 502 Twitch/IGDB upstream failure
    - 503 credentials not configured in this environment
    """
    try:
        return igdb_service.search_games(db, user.id, q)
    except RateLimitedError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except IgdbNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except IgdbUpstreamError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
