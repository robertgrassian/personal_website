# api/ — FastAPI backend

Python backend for the instanced game libraries feature, deployed as a Vercel
serverless function. `index.py` exposes the ASGI `app`; everything else lives in
the `app` package. All routes are served under the literal `/api/library` prefix
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
bruno/              every endpoint as a runnable request + its reference docs (see below)
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
- **Genres are sourced from Wikipedia on the write path, not taken from the client.** When
  an add creates a catalog row, `create_my_game` / `create_my_wishlist_item` call
  `genre_service.lookup_one` and store what the game's Wikipedia infobox says, because
  IGDB's genre field is too coarse to describe a library (Hades II with no roguelike). The
  client's genres are the fallback for a miss or an outage. It runs only when the row is
  new, skips the Wikidata leg, and never raises, so the common add pays nothing and a
  third-party outage cannot fail a write. This is what keeps new games agreeing with
  `scripts/backfill_genres.py`, which is a repair tool rather than the only source of good
  genres. Hand-entered games keep whatever the owner typed; the lookup runs only if they
  left it blank.
  <br>
  Note what the staleness refresh below does to that fallback: on a SHARED row it has a
  30-day half-life, because the next refresh replaces the client's genres with whatever
  Wikipedia says by then. Same for a release date, which IGDB re-asserts. Private rows are
  never refreshed, so a hand-entered game does keep what its owner typed, permanently.
- **`game_metadata.refreshed_at` is when the row was last re-sourced, and a read
  is what re-sources it.** The catalog stores facts that change after an add: a
  wishlisted game gets a release date, a game ships on another console, a genre
  is corrected. Serving a library therefore re-sources the two most out-of-date
  rows it just loaded (`app/services/catalog_refresh.py`), which is why the two
  read services can write. A row missing any sourced field is retried daily and
  a complete one after a month; the column is NOT NULL and defaults like
  `created_at`, which is true for a new row because the add path sources it on
  the way in, while the migration backfills existing rows from `created_at`
  rather than stamping them fresh. The stamp is written *before*
  the lookups, so a failure counts as an attempt and a game with no announced
  date cannot be retried on every page view. Hand-entered rows (`igdb_id IS
  NULL`) are skipped, and the game's **name** is never overwritten: IGDB's title
  is often not this library's (`scripts/backfill_titles.py`), and the stored
  name is what the Wikipedia genre lookup searches on. The backfill scripts
  remain the bulk repair tools; this is the trickle that keeps an active library
  from drifting.
- **Known gap: creating a shared row is first-write-wins and unvalidated.** Nothing checks
  the client's `igdb_id` against IGDB, so whoever adds a given IGDB game first defines the
  name and release date every later adder inherits — and no UI path edits a shared
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
  <br>
  "Same game" means same catalog row, i.e. same `igdb_id` — **not** same title. IGDB
  titles are not unique (five distinct games are called "Star Fox"), so owning one of
  them must not lock the rest out. Titles are only compared when one side has no
  `igdb_id` to compare: `find_game_by_name` closes the gap where the same game is added
  once through search and once by hand, since those are two catalog rows the unique key
  cannot see as one. That rule is mirrored in the add-game search's "already in your
  library" annotation (`ownedKey` in `GameSearchStep.tsx`), which is why `igdbId` is on
  the read DTOs.
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
  particular user played it on. The add path fills `platforms` from IGDB when it creates a
  catalog row (`lookup_platforms` in `app/services/igdb.py`), so it is populated on the way
  in; `scripts/backfill_platforms.py` is the repair tool for rows that predate that, and is
  re-runnable because it reads the ids straight out of `game_metadata.igdb_id`.
- **Both columns speak IGDB's platform vocabulary**, since migration `d1a83f6c25e7`. Before
  it, systems were typed by hand and the same console appeared under several names — 18 rows
  said `PS5` and 7 said `PlayStation 5`, so PlayStation 5 rendered as two separate shelves
  and the second one lost its colour (the CSS had no rule for it). Sharing one vocabulary
  also turns "did this game release on that console?" into a set membership test instead of
  a fuzzy match.
  <br>
  A few IGDB names read badly on a shelf, so the frontend maps those for **display only**
  (`systemLabel` in `src/lib/games.ts`, currently just `PC (Microsoft Windows)` → `PC`).
  Never store, compare against, or key CSS on a display label: `video-games.css` matches
  `[data-system="..."]` against the stored name, and a rule written against the label
  silently never fires. The fixture CSVs in `scripts/fixtures/` carry IGDB's names too, so a
  fresh `seed.py` cannot reintroduce the old vocabulary.
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
- **Two temporal types, chosen by who decided the value.** `timestamptz` for a moment the
  SYSTEM recorded (`game_metadata.refreshed_at`, `profiles.created_at`, `follows.created_at`,
  `played_games.created_at`); `date` for a calendar day a PERSON chose
  (`play_sessions.start_date` / `end_date`, `wishlist_games.date_added`,
  `game_metadata.release_date`). `wishlist_games.date_added` and `played_games.created_at`
  look like the same field under two names and are not: one is a day someone picked and
  shows on the wire as `dateAdded`, the other is an insert timestamp nothing reads.
  <br>
  **Not epoch milliseconds in a `bigint`**, which is the usual reflex from a JVM
  background and solves a problem Postgres does not have. The pain there is
  `TIMESTAMP WITHOUT TIME ZONE` plus a JDBC driver applying the JVM's default zone on the
  way in and out: the column never held an instant, and the conversion was implicit.
  `timestamptz` stores no zone at all -- it normalizes to UTC on write and holds an instant,
  which IS the simple model epoch-millis is reached for, and psycopg hands it back as an
  aware UTC `datetime` with no local-zone step anywhere. Storing an integer instead would
  buy nothing and cost `now()`, `interval` arithmetic, `date_trunc`, and a value anyone can
  read in psql or the Supabase table editor without dividing by a thousand. The wire format
  is unaffected either way: the API emits ISO strings, and `""` for absent.
  <br>
  **A timestamp earns its column by being read.** `game_metadata` carried a `created_at`
  that nothing ever queried, and whose value was a lie for every row predating the catalog
  normalization -- they all said the day that migration ran. `created_by_user_id` is the
  provenance that was actually wanted. Prefer no column to a decorative one.
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
7. **Document** — add the request to `bruno/`. `tests/test_bruno_collection.py`
   fails the build otherwise, so this is enforced rather than remembered.

## Endpoint reference: `bruno/`

[Bruno](https://usebruno.com) collection, checked in as plain text next to the
code it exercises. It is the human-readable endpoint documentation as well as a
client: each request's `docs` block records the status codes, the payload rules,
and why the route is shaped the way it is. Setup and conventions are in
[`bruno/README.md`](bruno/README.md).

`tests/test_bruno_collection.py` diffs it against the app's generated OpenAPI
document, so it cannot silently fall behind the routers. FastAPI also serves the
raw OpenAPI at `/api/library/openapi.json` and Swagger UI at `/api/library/docs` when
`APP_ENV=dev`; those are the generated truth about shapes, the collection is the
curated version with the reasoning attached.

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
