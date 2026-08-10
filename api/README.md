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

Seven tables in the `public` schema: `profiles`, `game_metadata`, `played_games`,
`play_sessions`, `wishlist_games`, `follows`, `rate_limits`. The SQLAlchemy models in
`app/models/` are the source of truth for their columns — the notes here are the
reasoning behind the shape, which the models themselves don't record.

- **Everything cascades from `profiles`**, whose `id` is an FK to `auth.users` with
  `ON DELETE CASCADE`. Deleting a profile takes that user's games, sessions, wishlist,
  and follow edges with it. `rate_limits` is the exception: it has no FK to `profiles`,
  so those rows must be deleted explicitly. `game_metadata` is deliberately not in the
  cascade either — see below.
- **A shared catalog plus per-user link tables.** `game_metadata` holds the game (name,
  cover, genres, release date, the platforms it released on); `played_games` and
  `wishlist_games` hold only what differs between users (which console _they_ played it
  on, how _they_ rated it, whether _they_ starred it). Two users owning the same game
  share one metadata row, and two copies of a game can no longer disagree about it.
  <br>
  Until 2026-08-10 both tables carried their own copy of that metadata. The normalized
  version had been rejected for v1 on the grounds that canonical rows need an ownership
  and moderation story, which the identity rule below is the answer to.
- **Catalog identity: `igdb_id` shared, everything else private.** A row with an
  `igdb_id` is SHARED — IGDB's id is the canonical key, so everyone who adds that game
  through search lands on the same row (`igdb_id` is UNIQUE; Postgres permits any number
  of NULLs under it). A row without one is PRIVATE to whoever typed it in
  (`created_by_user_id`, unique per creator + name). A hand-entered name is not a
  canonical key, so treating two users' "Tetris" as one game would let one person's typo
  rewrite the other's shelf. `created_by_user_id` is `ON DELETE SET NULL`, not CASCADE, so
  a deleted account cannot take a catalog row out from under someone else.
- **Known gap: creating a shared row is first-write-wins and unvalidated.** Nothing checks
  the client's `igdb_id` against IGDB, so whoever adds a given IGDB game first defines the
  name, genres and release date every later adder inherits — and no UI path edits a shared
  row afterwards. `POST /me/games {"name": "anything", "igdbId": 1051}` is enough. Bounded
  in three ways today: `MAX_USERS` is 100 and signup is capped, writes are rate-limited,
  and `validate_igdb_image_url` restricts `image_url` to the IGDB CDN so the cover can only
  be swapped for another real IGDB cover. Accepted for now; the fix is verifying `igdb_id`
  against IGDB on create, which puts a network call in the write path. Tracked in `TODO.md`.
  The private/shared split removes the need for a moderation story about _editing_, not
  about _first creation_ — do not read it as covering both.
- **One entry per game per user**, via `UNIQUE (user_id, metadata_id)` on both link
  tables. The console is a field on the entry, not part of its identity, so adding a game
  you already own on a different console is a 409 rather than a second row. Allowing two
  consoles later is a one-statement relaxation of that key to include `system`, with no
  data rewrite — but note the _feature_ then lives in the frontend, since two rows means
  two cases on the shelf until `pipeline.ts` groups them by `metadata_id`.
- **`play_sessions.game_id` points at the user's row, not the catalog.** It is a real FK
  (the CSVs joined sessions to games by exact name, which is the correctness bug this
  schema exists to fix), and it must stay on `played_games`: a session is a fact about a
  person, so a catalog FK would need `user_id` beside it and would make "a session for a
  game not in my library" representable. Its `ON DELETE CASCADE` is also what makes
  "remove from library" take the play history with it, which would be wrong in both
  directions against a shared row. Merging two catalog rows therefore repoints link rows
  and touches no session.
- **`game_metadata.platforms` vs `played_games.system`.** The first is every platform the
  game released on — the catalog's fact, and what makes "which consoles are valid for
  this game?" answerable without asking every user. The second is the one console a
  particular user played it on. Currently `platforms` is seeded from the consoles people
  actually recorded, which is a weak stand-in for IGDB's real list.
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
