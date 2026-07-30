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
  models/           SQLAlchemy 2.0 entities; core/db.py has engine + get_db dependency
alembic/            migrations (env.py scoped to the public schema — auth etc. are Supabase's)
scripts/seed.py     CSV → DB seed (idempotent truncate-and-reload); also seeds Robert's auth.users row
tests/              pytest + FastAPI TestClient; DB tests skip without DATABASE_URL
```

Routers get a DB session via the `get_db` dependency in `app/core/db.py`
(`db: Annotated[Session, Depends(get_db)]`). Authenticated routes add the
`CurrentUser` dependency from `app/core/auth.py` — declaring a `user: CurrentUser`
parameter both enforces a valid Bearer JWT (401 otherwise) and hands the handler
the verified `AuthenticatedUser` (id from the `sub` claim). See `routers/me.py`.

## Data model

Six tables in the `public` schema: `profiles`, `games`, `play_sessions`,
`wishlist_items`, `follows`, `rate_limits`. The SQLAlchemy models in `app/models/`
are the source of truth for their columns — the notes here are the reasoning behind
the shape, which the models themselves don't record.

- **Everything cascades from `profiles`**, whose `id` is an FK to `auth.users` with
  `ON DELETE CASCADE`. Deleting a profile takes that user's games, sessions, wishlist,
  and follow edges with it. `rate_limits` is the exception: it has no FK to `profiles`,
  so those rows must be deleted explicitly.
- **Per-user game rows, not a shared catalog.** `games` and `wishlist_items` each carry
  their own copy of name/system/genres/release_date/image_url, so two users owning the
  same game store it twice. The normalized alternative was rejected for v1: users can add
  games IGDB doesn't have, metadata disagreements get thorny ("my copy is the Switch
  port"), and the join complicates every query. The nullable `igdb_id` on both tables is
  the escape hatch — it is the intended grouping key if this is ever normalized.
- **`play_sessions.game_id` is a real FK.** The CSVs joined sessions to games by exact
  name, which is the correctness bug this schema exists to fix.
- **`genres` is `text[]`, not a join table.** The only query is "contains genre", which
  arrays plus a GIN index handle, and it matches the `genres: string[]` type on the
  frontend.
- **`rating` is a CHECK constraint** mirroring `RATINGS` in `src/lib/games.ts`. Two
  sources of truth for five values is an accepted duplication; the API validates and the
  DB backstops. NULL means unrated.
- **`username` is `citext`** so `/u/Robert` and `/u/robert` are one person, with a format
  CHECK (URL-safe, 3-30 chars) and an app-level reserved list. That list must include
  API-colliding tokens: `me` and `search` would otherwise shadow `GET /users/{username}`.
- **`follows` is a bare directed edge table** with a composite PK making duplicate edges
  impossible and a CHECK rejecting self-follows. Counts are `COUNT(*)`; denormalized
  counter columns are a later optimization if ever needed. `ix_follows_followee_id` exists
  because the composite PK cannot answer "who follows X?".
- **Auto-follow at signup lives in application code, not a DB trigger** — the profile row
  and both founder edges are inserted in one transaction (`repositories/me.py`). It needs
  an explicit `flush()` between them: `Follow` declares no ORM relationship to `Profile`,
  so the unit of work has no mapper dependency and will otherwise emit the `follows` INSERT
  first and violate the FK.
- **Play state is derived in Python**, not SQL: an open session (NULL `end_date`) means
  currently playing, and the newest `end_date` is last played, merged in the service layer
  from two queries. Window functions are a profiling-driven optimization only.
- **Alembic is scoped to the `public` schema.** The `auth` schema belongs to Supabase's
  GoTrue, and autogenerate would otherwise see those tables as undeclared and try to drop
  them. The `profiles → auth.users` FK is declared in a migration, but that table is never
  managed here.

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
