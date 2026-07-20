# api/ — FastAPI backend

Python backend for the instanced game libraries feature, deployed as a Vercel
serverless function. `index.py` exposes the ASGI `app`; everything else lives in
the `app` package. All routes are served under the literal `/api/py` prefix
(`API_PREFIX` in `app/core/config.py`) — Vercel and the dev rewrite both deliver
the full original path to FastAPI.

## Layer map

```
index.py            Vercel entrypoint: app = create_app()
app/
  main.py           app factory; docs enabled only when APP_ENV=dev; routers registered here
  core/config.py    pydantic-settings Settings + API_PREFIX
  core/auth.py      JWT verification (JWKS/ES256; HS256 legacy fallback) → CurrentUser dependency
  core/supabase_admin.py  GoTrue Admin API client (delete auth user — over-cap cleanup)
  routers/          HTTP concerns only (controllers) — delegate to services
  services/         business logic — orchestrate repositories, derive domain state
  repositories/     all DB access — nothing else touches the database
  schemas/          Pydantic request/response DTOs (mirror the FE TS types)
  models/           SQLAlchemy 2.0 entities (spec §4.2 schema); core/db.py has engine + get_db dependency
alembic/            migrations (env.py scoped to the public schema — auth etc. are Supabase's)
scripts/seed.py     CSV → DB seed (idempotent truncate-and-reload); also seeds Robert's auth.users row
tests/              pytest + FastAPI TestClient; DB tests skip without DATABASE_URL
```

Routers get a DB session via the `get_db` dependency in `app/core/db.py`
(`db: Annotated[Session, Depends(get_db)]`). Authenticated routes add the
`CurrentUser` dependency from `app/core/auth.py` — declaring a `user: CurrentUser`
parameter both enforces a valid Bearer JWT (401 otherwise) and hands the handler
the verified `AuthenticatedUser` (id from the `sub` claim). See `routers/me.py`.

## Adding a new endpoint

1. **Schema** — define request/response models in `app/schemas/`.
2. **Repository** — add the queries in `app/repositories/` (SQLAlchemy only, no logic).
3. **Service** — add the business logic in `app/services/`, calling the repository.
4. **Router** — add a module in `app/routers/` with
   `router = APIRouter(prefix=API_PREFIX, ...)`; keep it to HTTP concerns
   (path/verb, status codes, dependencies) and delegate to the service. For an
   authenticated route, add a `user: CurrentUser` parameter (from
   `app/core/auth.py`) — it enforces the JWT and provides the caller's id.
5. **Register** — `app.include_router(...)` in `app/main.py`.
6. **Test** — add a `tests/test_*.py` using `TestClient(create_app())`. For
   authed routes, either mint an HS256 token (see `tests/test_auth.py`) or
   override the `get_current_user` dependency (see `tests/test_me_api.py`).

## Commands (from `api/`)

```
uv sync                          # create .venv on Python 3.12 + install deps (incl. dev group)
uv run pytest                    # tests (DB tests need DATABASE_URL + migrated DB)
uv run ruff check .              # lint (ruff also handles import sorting)
uv run ruff format .             # format
uv run alembic upgrade head      # apply migrations (URL comes from Settings, not alembic.ini)
uv run alembic revision --autogenerate -m "..."   # new migration (hand-review the output)
uv run python scripts/seed.py    # seed from the repo-root CSVs
```

Run the dev server from the repo root with `npm run dev:api` (uvicorn on :8000),
or `npm run dev:full` for Next + FastAPI together.

## Dependency changes

Runtime deps install on Vercel from the **repo-root `requirements.txt`**, which
is generated — never hand-edited:

```
uv add <package>                # or: uv add --dev <package> (dev-only)
uv export --no-dev --no-hashes -o ../requirements.txt
```

Dev-only tools (uvicorn, ruff, pytest, httpx) stay in the `dev` group so they
never ship in the function bundle; Vercel provides the ASGI server.
