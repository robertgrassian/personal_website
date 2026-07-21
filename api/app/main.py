"""FastAPI application factory."""

from fastapi import FastAPI

from app.core.config import API_PREFIX, get_settings
from app.routers import health, me, users


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

    app.include_router(health.router)
    app.include_router(users.router)
    app.include_router(me.router)
    return app
