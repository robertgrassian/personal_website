"""The genre lookup endpoint. HTTP concerns only, same layering as the other
routers.

Sits beside the IGDB proxy and is called right after it: the add-game picker
takes the identity of a game from IGDB, then asks here what its genres are,
because IGDB's own genre field is too coarse to describe a library (see
services/genres.py). Authenticated but not owner-scoped -- a lookup costs
third-party quota, not library state.

Guarded by forbid_in_preview because the read path WRITES rate-limit counters,
and preview deploys hold a read-only Postgres role.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser
from app.core.config import API_PREFIX
from app.core.db import get_db
from app.core.guards import forbid_in_preview
from app.schemas.genres import GenreLookupResult
from app.services import genres as genre_service
from app.services.rate_limit import RateLimitedError

router = APIRouter(prefix=API_PREFIX, tags=["genres"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/genres/lookup", dependencies=[Depends(forbid_in_preview)])
def lookup_genres(
    user: CurrentUser,
    db: DbSession,
    name: Annotated[str, Query(min_length=1, max_length=200)],
) -> GenreLookupResult:
    """Genres for one game title, sourced from Wikipedia/Wikidata.

    A title that resolves to nothing is a 200 with empty genres, not a 404:
    "Wikipedia doesn't know this game" is an ordinary outcome for an obscure or
    misspelled title, and the picker falls back to IGDB's genres rather than
    treating it as an error.

    Status mapping:
    - 429 caller over their per-minute lookup budget
    """
    try:
        result = genre_service.lookup_for_user(db, user.id, name)
    except RateLimitedError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    return GenreLookupResult(
        genres=result.genres,
        article=result.article or "",
    )
