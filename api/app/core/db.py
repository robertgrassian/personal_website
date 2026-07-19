"""SQLAlchemy engine and session wiring (spec §3.1).

One code path for every environment: the settings below are mandatory when
connecting through Supabase's transaction-mode pooler (Supavisor) in
production and harmless against the direct local connection, so there is no
env branching here.

- ``poolclass=NullPool`` — Supavisor owns connection pooling. A client-side
  pool inside a serverless function would pin connections across invocations
  of a process that may be frozen or killed at any time, exhausting the
  pooler for no benefit.
- ``prepare_threshold=None`` — disables psycopg's automatic server-side
  prepared statements. Transaction-mode pooling hands each transaction to an
  arbitrary backend connection, so session-scoped prepared statements from a
  previous transaction don't exist there; leaving this on works locally
  against the direct connection and fails only once deployed behind the
  pooler.
"""

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


def normalize_database_url(url: str) -> str:
    """Pin the SQLAlchemy dialect to psycopg 3.

    DATABASE_URL is kept in standard libpq form (``postgresql://``) so the
    same value works for psql and any other tool; SQLAlchemy's default driver
    for that scheme is psycopg2, which is not installed.
    """
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Configure it in the repo-root .env "
            "(local) or the deployment's env vars before using the database."
        )
    return create_engine(
        normalize_database_url(settings.database_url),
        poolclass=NullPool,
        connect_args={"prepare_threshold": None},
    )


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    # expire_on_commit=False keeps ORM objects readable after the request's
    # commit — with NullPool the connection is gone, so attribute refresh
    # after commit would otherwise raise.
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a Session, closes it on request teardown.

    Usage in a router: ``db: Annotated[Session, Depends(get_db)]``.
    """
    session = get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()
