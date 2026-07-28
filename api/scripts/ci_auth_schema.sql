-- Minimal stand-in for Supabase's `auth.users`, for CI only.
--
-- Locally and in production this table is owned and created by GoTrue (the
-- Supabase auth service), which is why Alembic never creates it and why the
-- SQLAlchemy model deliberately omits the foreign key. But migration
-- f985740c0df9 adds a real DB-level FK from `profiles.id` to `auth.users(id)`,
-- so `alembic upgrade head` cannot run against a bare Postgres without this
-- table existing first. CI runs a plain postgres:16 service container, not the
-- Supabase stack, so it needs one.
--
-- Scope: only the columns actually inserted by the test suite (`_INSERT_AUTH_USER`
-- in tests/test_me_api.py, the insert in tests/test_db_constraints.py) and by
-- scripts/seed.py, which CI runs to populate the fixture data test_users_api.py
-- reads. This is a test double for tables we do not own, not a reproduction of
-- GoTrue's schema — everything except the primary keys is nullable so every
-- insert works. Nothing reads these columns; they exist so the inserts don't error.
--
-- Run before `alembic upgrade head`:
--   psql "$DATABASE_URL" -f scripts/ci_auth_schema.sql

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id                      uuid PRIMARY KEY,
    instance_id             uuid,
    aud                     varchar(255),
    role                    varchar(255),
    email                   varchar(255),
    encrypted_password      varchar(255),
    email_confirmed_at      timestamptz,
    created_at              timestamptz,
    updated_at              timestamptz,
    raw_app_meta_data       jsonb,
    raw_user_meta_data      jsonb,
    confirmation_token      varchar(255),
    recovery_token          varchar(255),
    email_change_token_new  varchar(255),
    email_change            varchar(255)
);

-- seed.py also writes an identity row so GoTrue would treat the seeded user as
-- a real signup. CI never runs GoTrue, but the insert still has to land.
CREATE TABLE IF NOT EXISTS auth.identities (
    provider_id     text,
    user_id         uuid REFERENCES auth.users (id) ON DELETE CASCADE,
    identity_data   jsonb,
    provider        text,
    last_sign_in_at timestamptz,
    created_at      timestamptz,
    updated_at      timestamptz,
    PRIMARY KEY (provider_id, provider)
);
