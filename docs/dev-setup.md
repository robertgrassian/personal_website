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

Not wired up yet — `DATABASE_URL` is read but unused. `supabase start` /
migration / seed instructions land with the DB workstream.
