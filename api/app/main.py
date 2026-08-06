"""FastAPI application factory."""

from fastapi import FastAPI

from app.core.config import API_PREFIX, get_settings
from app.core.errors import register_error_handlers
from app.routers import genres, health, igdb, me, users


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

    app.include_router(health.router)
    app.include_router(users.router)
    app.include_router(me.router)
    app.include_router(igdb.router)
    app.include_router(genres.router)
    return app
