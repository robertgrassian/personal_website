# Dev setup

Local development quickstart for the site (Next.js) and its Python API (FastAPI,
see `api/README.md` for the backend's layer map).

## Prerequisites

- **Node 22** + npm
- **[uv](https://docs.astral.sh/uv/)** — Python package/project manager; it
  downloads Python 3.12 automatically (no system Python needed)
- **Docker Desktop** — required by the Supabase local stack (DB workstream)
- **[Supabase CLI](https://supabase.com/docs/guides/local-development)** — local
  Postgres + auth stack (DB workstream)

## Install

```sh
npm install                # Next.js deps
cd api && uv sync && cd .. # Python 3.12 venv at api/.venv + all deps
cp .env.example .env       # local config (placeholders are fine for now)
```

## Run

```sh
npm run dev:full   # Next (:3000) + FastAPI via uvicorn (:8000), one command
```

Or individually: `npm run dev` (Next only) / `npm run dev:api` (API only).

The Next dev server proxies `/api/py/*` to uvicorn, so the API is reachable both
directly (http://127.0.0.1:8000/api/py/health) and through Next
(http://localhost:3000/api/py/health). Interactive API docs (dev only):
http://127.0.0.1:8000/api/py/docs

## Lint & test

```sh
npm run lint                            # ESLint (frontend)
cd api && uv run ruff check .           # Python lint + import order
cd api && uv run pytest                 # Python tests
```

## Database

The local database is the Supabase CLI stack; migrations are Alembic's (the
Supabase CLI's own migration system is deliberately unused — `supabase start`
is infrastructure only). All commands below run from `api/`.

```sh
supabase start                       # once: local Postgres on :54322 (+ auth, Studio)
uv run alembic upgrade head          # apply migrations
uv run python scripts/seed.py        # load games.csv / sessions.csv / wishlist.csv
```

`DATABASE_URL` in the repo-root `.env` points at the local stack
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

The seed script is idempotent (truncate-and-reload) — rerun it whenever the
CSVs change. It fails loudly if a `sessions.csv` game name doesn't resolve to
exactly one library game; fix the CSV and rerun.

**Resetting:** the simplest reset is through Alembic:

```sh
uv run alembic downgrade base && uv run alembic upgrade head && uv run python scripts/seed.py
```

`supabase db reset` also works but rebuilds the _entire_ database from the
Supabase CLI's point of view — which knows nothing about Alembic — so it wipes
the `alembic_version` table along with the schema. After a `supabase db reset`
you must rerun `alembic upgrade head` + the seed anyway; prefer the Alembic
roundtrip above unless the stack itself is wedged.
