from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import API_PREFIX, Settings, get_settings

router = APIRouter(prefix=API_PREFIX, tags=["health"])


@router.get("/health")
def health(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, str]:
    # A DB ping is added when the database layer lands; until then this only
    # proves the function boots and reads its environment.
    return {"status": "ok", "env": settings.app_env}
