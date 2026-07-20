"""Cross-cutting request guards, applied as FastAPI route dependencies."""

from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.core.config import Settings, get_settings


def forbid_in_preview(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    """Refuse mutations when APP_ENV=preview (spec §7.5).

    Vercel preview deploys point at production through a read-only Postgres
    role and must never write. Without this, a write on a preview URL would
    surface as an ugly DB-permission 500; the guard makes it a clean,
    intentional 503 instead. Attach to every mutating route via the route's
    ``dependencies=[Depends(forbid_in_preview)]``.
    """
    if settings.app_env == "preview":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Writes are disabled in preview environments.",
        )
