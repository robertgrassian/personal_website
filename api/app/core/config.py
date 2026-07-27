"""Environment-driven application settings.

All configuration comes from environment variables (Vercel env vars in
production, the gitignored repo-root ``.env`` locally). No secrets are ever
committed; ``.env.example`` at the repo root documents the variable names.
"""

import logging
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
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

    # --- Auth ----------------------------------------------------------------
    # Token verification. The current Supabase CLI stack signs access tokens
    # with asymmetric keys (ES256) and publishes a JWKS endpoint — identical to
    # hosted Supabase — so BOTH local and prod use the JWKS path: set
    # SUPABASE_JWKS_URL (local: http://127.0.0.1:54321/auth/v1/.well-known/jwks.json).
    # SUPABASE_JWT_SECRET remains supported for a legacy HS256 project; when
    # both are set the secret wins. Exactly one should be configured.
    supabase_jwt_secret: str | None = None
    supabase_jwks_url: str | None = None
    # Expected `iss` claim, e.g. http://127.0.0.1:54321/auth/v1 locally.
    # Verified when set; leaving it unset skips the issuer check (dev nicety,
    # not for prod).
    supabase_auth_issuer: str | None = None

    # Base URL of the Supabase stack (http://127.0.0.1:54321 locally) plus the
    # service-role key, used server-side only for the GoTrue Admin API (the
    # over-cap auth-user cleanup; account deletion later). The service-role key
    # bypasses all authorization — never exposed to clients.
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    # Signup cap: profile creation refuses once this many profiles exist.
    # Free-tier abuse insurance, adjustable without a deploy.
    max_users: int = 100

    # --- IGDB proxy ------------------------------------------------------------
    # Twitch application credentials (IGDB authenticates via Twitch OAuth).
    # Server-side only, never exposed to clients; unset → /igdb/search
    # answers 503. Same credentials scripts/fetch-covers.ts used inline.
    twitch_client_id: str | None = None
    twitch_client_secret: str | None = None

    @model_validator(mode="after")
    def _warn_ambiguous_auth_config(self) -> "Settings":
        # If both verification modes are configured, decode_token uses the
        # HS256 secret and ignores JWKS — a leftover/weak secret would silently
        # downgrade verification. Warn once (Settings is constructed once, via
        # the lru_cache below) rather than failing, since a valid single-mode
        # setup is the norm and this is a footgun guard, not a hard error.
        if self.supabase_jwt_secret and self.supabase_jwks_url:
            logging.getLogger(__name__).warning(
                "Both SUPABASE_JWT_SECRET and SUPABASE_JWKS_URL are set; HS256 "
                "(the shared secret) takes precedence and JWKS is ignored. "
                "Configure exactly one."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide Settings instance (env is read once)."""
    return Settings()
