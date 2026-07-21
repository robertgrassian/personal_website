"""Alembic environment, wired to the app's Settings and model metadata.

Scoped to the ``public`` schema only: the local/hosted Supabase database also
contains schemas owned and migrated by other services — GoTrue owns ``auth``,
plus ``storage``, ``realtime``, ``graphql_public``, ``vault``, ``extensions``,
and friends. Without the filters below, autogenerate would see those tables as
undeclared and emit drops for them.
"""

from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from alembic import context
from app.core.config import get_settings
from app.core.db import normalize_database_url
from app.models import Base

config = context.config

target_metadata = Base.metadata


def _database_url() -> str:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Alembic reads it from the repo-root "
            ".env (local) or the environment — there is no URL in alembic.ini."
        )
    return normalize_database_url(settings.database_url)


def include_name(name, type_, parent_names):
    """Reflection filter: only the public schema exists as far as Alembic is
    concerned. ``None`` is the connection's default schema (public)."""
    if type_ == "schema":
        return name in (None, "public")
    return True


def include_object(obj, name, type_, reflected, compare_to):
    """Object filter (second line of defense): skip anything that reflects
    with an explicit non-public schema, plus foreign keys that point INTO
    such a schema — migration f985740c0df9 adds profiles.id → auth.users,
    which exists in the DB but deliberately not in the model metadata
    (auth belongs to GoTrue); without this, autogenerate would propose
    dropping it on every run."""
    if type_ == "foreign_key_constraint":
        referred = obj.referred_table
        if referred is not None and referred.schema not in (None, "public"):
            return False
    schema = getattr(obj, "schema", None)
    return schema in (None, "public")


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a DB connection (``alembic upgrade --sql``)."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=include_name,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # NullPool: migrations are a one-shot process; also correct if ever run
    # against a pooled connection string.
    engine = create_engine(_database_url(), poolclass=NullPool)

    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_name=include_name,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
