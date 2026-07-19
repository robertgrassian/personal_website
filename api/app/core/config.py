"""Environment-driven application settings (spec §7.6).

All configuration comes from environment variables (Vercel env vars in
production, the gitignored repo-root ``.env`` locally). No secrets are ever
committed; ``.env.example`` at the repo root documents the variable names.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Every route is registered under this literal prefix. In production Vercel
# invokes the function with the original request path (/api/py/...), and in
# dev the Next.js rewrite proxies the same path to uvicorn — so FastAPI must
# route on the full path rather than being mounted behind a stripped prefix.
API_PREFIX = "/api/py"

# Resolve the repo-root .env by file location, not cwd: uvicorn runs with
# cwd=api/ locally while Vercel runs from the repo root. Missing files are
# ignored by pydantic-settings, so this is a no-op in production.
_REPO_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_REPO_ROOT_ENV, extra="ignore")

    app_env: str = "dev"  # dev | preview | prod
    # Optional until the DB workstream lands; becomes required alongside the
    # SQLAlchemy session wiring.
    database_url: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide Settings instance (env is read once)."""
    return Settings()
