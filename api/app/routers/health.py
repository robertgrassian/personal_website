from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import API_PREFIX, Settings, get_settings

router = APIRouter(prefix=API_PREFIX, tags=["health"])


@router.get("/health")
def health(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, str]:
    """Liveness check, and the daily keep-alive target that stops Supabase's
    free-tier inactivity pause (spec decision #20) — hence the real SELECT 1
    rather than a connection-only ping.

    Without a configured DATABASE_URL the DB check is skipped and the ``db``
    field omitted, so the function still proves it boots in DB-less
    environments (e.g. CI without secrets).
    """
    payload = {"status": "ok", "env": settings.app_env}
    if settings.database_url:
        # Imported here so a DB-less environment never touches the engine
        # module's connection machinery.
        from app.core.db import get_engine

        try:
            with get_engine().connect() as conn:
                conn.execute(text("SELECT 1"))
        except SQLAlchemyError as exc:
            raise HTTPException(
                status_code=503, detail=f"Database health check failed: {exc.__class__.__name__}"
            ) from exc
        payload["db"] = "ok"
    return payload
