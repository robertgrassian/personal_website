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
  routers/          HTTP concerns only (controllers) — delegate to services
  services/         business logic — orchestrate repositories, derive domain state
  repositories/     all DB access — nothing else touches the database
  schemas/          Pydantic request/response DTOs (mirror the FE TS types)
  models/           SQLAlchemy entities (Postgres schema)
tests/              pytest + FastAPI TestClient
```

`services/`, `repositories/`, `schemas/`, `models/` are empty skeletons until
the DB workstream lands.

## Adding a new endpoint

1. **Schema** — define request/response models in `app/schemas/`.
2. **Repository** — add the queries in `app/repositories/` (SQLAlchemy only, no logic).
3. **Service** — add the business logic in `app/services/`, calling the repository.
4. **Router** — add a module in `app/routers/` with
   `router = APIRouter(prefix=API_PREFIX, ...)`; keep it to HTTP concerns
   (path/verb, status codes, dependencies) and delegate to the service.
5. **Register** — `app.include_router(...)` in `app/main.py`.
6. **Test** — add a `tests/test_*.py` using `TestClient(create_app())`.

## Commands (from `api/`)

```
uv sync                 # create .venv on Python 3.12 + install deps (incl. dev group)
uv run pytest           # tests
uv run ruff check .     # lint (ruff also handles import sorting)
uv run ruff format .    # format
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
