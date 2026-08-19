"""FastAPI application factory."""

from fastapi import FastAPI

from app.core.config import API_PREFIX, get_settings
from app.core.errors import register_error_handlers
from app.routers import catalog, health, me, users


def create_app() -> FastAPI:
    settings = get_settings()

    # OpenAPI/docs routes exist only when APP_ENV=dev; setting the URLs to None
    # removes them entirely in preview/prod.
    dev = settings.app_env == "dev"
    app = FastAPI(
        title="personal-website-api",
        docs_url=f"{API_PREFIX}/docs" if dev else None,
        redoc_url=f"{API_PREFIX}/redoc" if dev else None,
        openapi_url=f"{API_PREFIX}/openapi.json" if dev else None,
    )

    # One handler maps every DomainError to its status, so route handlers can
    # call services directly instead of each re-deriving the same mapping.
    register_error_handlers(app)

    # Routers declare their paths WITHOUT the prefix and it is applied here, so
    # the one place that decides where this API lives is API_PREFIX rather than
    # four APIRouter() calls that have to agree.
    for router in (health.router, users.router, me.router, catalog.router):
        app.include_router(router, prefix=API_PREFIX)
    return app
