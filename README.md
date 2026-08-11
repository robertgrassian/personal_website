# Robert Grassian — Personal Website

[rgrassian.com](https://rgrassian.com)

A personal site with a resume, and a video game library that got out of hand.

The library is the real project. It started as a page listing every game I have
played, read from a CSV, and became a small multi-user application: Google
sign-in, a shared game catalog, per-user shelves, play sessions, wishlists, and
a follow graph. I am a backend engineer by trade, so I built it the way I would
build a service at work — a typed API over Postgres, layered routers → services
→ repositories, migrations, tests — and used the frontend half to learn modern
React properly rather than by osmosis. The Next.js App Router, Server
Components, Server Actions and cache invalidation are all here because I wanted
to understand what they actually do.

It is a hobby project and reads like one in places. The parts I would defend in
review are the data model, the read/write split, and the fact that nothing
guesses: an unreachable API fails the build instead of shipping an empty shelf.

## Features

- **Home** — Full-bleed hero with navigation tiles linking to each section
- **About** — Bio, photos, and social links
- **Resume** — Work experience (Harness, Split Software, Cisco), education (UC Berkeley), and skills
- **Game Library** — The main event; see below

A persistent site-wide nav bar (Caveat font, sticky) links all sections. The
homepage is nav-free: it has its own tile navigation.

## The Game Library

Every game I have played, on shelves. Cover art sits on wooden planks styled to
evoke a home collection or a Blockbuster aisle, each case flips to a back face
with its metadata, and a CRT television above the shelves cycles through
whatever I am currently playing like flicking channels.

**Browsing** (anyone): search, filter by rating, system or genre, group by
system, rating, genre or decade, and sort within each shelf. All of it happens
client-side over an already-loaded library, so it is instant and survives in the
URL. There is also a SQL panel that runs real `SELECT`s against the library in
the browser via [AlaSQL](https://alasql.org), which exists mostly because I
thought it was funny that a backend engineer's website should let you query it.

**Owning a library** (signed in): add games via an [IGDB](https://www.igdb.com)
search that brings its own cover art, rate them on a five-tier scale, start and
stop play sessions, log past playthroughs, keep a wishlist, and follow other
people. Libraries live at `/video-games/u/{username}`; mine keeps the original
`/video-games` URL and doubles as the logged-out demo.

**Play state is derived, never stored.** An open play session (one with no end
date) is what makes a game "currently playing", and the newest end date is when
you last played it. There is no boolean column that can drift out of sync with
the sessions.

Data lives in Postgres (Supabase) and is served by the FastAPI backend under
`/api/py`. The library is edited entirely through the site: no CSV commits. A
frozen CSV snapshot in `api/scripts/fixtures/` seeds a local dev database and is
never read by the running site.

## Architecture

**[`docs/architecture.md`](docs/architecture.md) has the diagram and the
detail.** The short version:

The browser never talks to Postgres. Next.js acts as a backend-for-frontend: it
renders pages on the server and brokers every write. FastAPI is the only thing
holding a database connection.

- **Reads are public and cached.** A Server Component fetches through
  `src/lib/libraryApi.ts` (which imports `server-only`, so bundling it into the
  browser is a build error) and hits the public `/api/py/users/{username}/*`
  endpoints.
- **Writes are owner-only.** A Server Action in `src/app/video-games/actions.ts`
  calls `src/lib/meApi.ts`, which exchanges the session cookie for a Bearer JWT
  and hits `/api/py/me/*`. On success it invalidates the affected cache tags.
  The browser never holds an API token of its own.

Documentation is split so the same fact does not drift across four files:

| File                                                 | Owns                                   |
| ---------------------------------------------------- | -------------------------------------- |
| This file                                            | What the project is, and how to run it |
| [`docs/architecture.md`](docs/architecture.md)       | The request flow, end to end           |
| [`api/README.md`](api/README.md)                     | Backend layer map and the data model   |
| [`docs/dev-setup.md`](docs/dev-setup.md)             | Local setup, database, resetting       |
| [`docs/supabase-primer.md`](docs/supabase-primer.md) | Why Supabase is not used as a BaaS     |

## Tech Stack

- [Next.js 15](https://nextjs.org) (App Router, React 19, Turbopack)
- [TypeScript](https://www.typescriptlang.org) (strict mode)
- [Tailwind CSS 4](https://tailwindcss.com)
- [FastAPI](https://fastapi.tiangolo.com) + [SQLAlchemy 2.0](https://www.sqlalchemy.org) + [Alembic](https://alembic.sqlalchemy.org), Python 3.12
- [Supabase](https://supabase.com) for Postgres and auth; deployed on [Vercel](https://vercel.com)
- ESLint + Prettier + Husky pre-commit hooks; [Ruff](https://docs.astral.sh/ruff) and pytest on the Python side

## Authentication

Users sign in with **Google** (OpenID Connect). Supabase Auth brokers that sign-in and, once Google has verified the user's identity, mints the site's own session token — a signed JWT (ES256) — and owns the user store (`auth.users`). Google's only job is proving _who_ the user is; the token the app actually uses is issued by Supabase, not Google.

Authorization is handled by the **FastAPI backend**, not by Supabase. On each request FastAPI verifies the JWT locally against Supabase's public keys (its JWKS endpoint) — no per-request round-trip to Supabase — and enforces access in application code: reads are public, writes are owner-only (`jwt.sub == row.user_id`). We deliberately don't use Supabase as a backend-as-a-service or its Row-Level Security — the browser never talks to the database, and FastAPI is its only client. That choice follows from the stack: the app server is Python, and Supabase's client libraries and RLS story are built around the browser talking to Postgres directly, which is exactly what we don't do.

## Design decisions

The game library was built as a multi-user ("instanced") feature over six phases, finished 2026-07-30. The decisions below still explain why the code looks the way it does; the rest are visible in the code itself.

| Decision                                  | Why                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All libraries public**                  | No private-library setting in v1. Libraries, follower lists, and following lists are all public, which is what lets the pages be statically cached and shared across viewers.                                                                                                                                                         |
| **Per-viewer UI resolves client-side**    | A corollary of the above: cached payloads carry public data only, so anything that depends on who is looking (owner edit controls, the follow button, the sign-up banner) resolves after hydration via uncached authenticated calls. Putting any of it in the server render would leak one viewer's state into another's cached HTML. |
| **`/video-games` stays Robert's library** | Its URL never moved, so existing links keep working, and it doubles as the logged-out demo. Other users live at `/video-games/u/{username}`, and `/library` is a redirect-only route that resolves a signed-in user to their own.                                                                                                     |
| **A shared catalog, plus per-user rows**  | `game_metadata` holds the game itself (name, cover, genres, platforms); per-user tables hold only what differs between people (which console _they_ played it on, how _they_ rated it). Two users owning one game share one metadata row and can no longer disagree about it.                                                         |
| **Google OAuth only**                     | No passwords, no magic links in production, so there are no credentials to store or reset. Local development uses magic links captured by Mailpit.                                                                                                                                                                                    |
| **Signup is capped**                      | `MAX_USERS` (100) bounds a hobby project's exposure; over the cap, signup shows an "at capacity" message. Adjustable without a deploy.                                                                                                                                                                                                |
| **Cover art is hotlinked from IGDB**      | Zero storage and egress cost, and images stay current. Revisit only if the URLs break.                                                                                                                                                                                                                                                |
| **One global rating scale**               | Five tiers (Perfect through Bad) for every user. Per-user scales would make cross-library comparison meaningless.                                                                                                                                                                                                                     |
| **Play state is derived, not stored**     | An open play session is the source of truth for "currently playing" rather than a boolean column, so the two can never disagree.                                                                                                                                                                                                      |
| **The build fails on an unreachable API** | `/video-games` prerenders from the API. There is no CSV fallback, because a fallback means shipping a plausible-looking empty library instead of a loud error.                                                                                                                                                                        |

## Getting Started

### Frontend only (quick)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). In this mode the static pages (home, about, resume) render, but the game library and auth need the full stack below — the library reads from the API, which requires `LIBRARY_API_ORIGIN` and a running backend.

### Full stack (frontend + backend + database)

The backend is a FastAPI (Python) app talking to a local [Supabase](https://supabase.com) stack (Postgres + Auth). Prerequisites: [Docker](https://www.docker.com), [uv](https://docs.astral.sh/uv), and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
# 1. Bring up the local Supabase stack (Postgres, Auth, Studio, Mailpit)
supabase start

# 2. Configure the environment: copy the template, then fill in local values
cp .env.example .env        # values come from `supabase status -o env`

# 3. Install Python deps, migrate and seed the database (from api/)
cd api
uv sync
uv run alembic upgrade head
uv run python scripts/seed.py
cd ..

# 4. Start Next.js and FastAPI together
npm run dev:full
```

Open [http://localhost:3000](http://localhost:3000). Local sign-in uses **magic links** (production uses Google) — the email is captured by [Mailpit](http://127.0.0.1:54324); click the link to finish signing in. The database UI (Supabase Studio) is at [http://127.0.0.1:54323](http://127.0.0.1:54323).

See [`docs/dev-setup.md`](docs/dev-setup.md) for the fuller version (resetting the database, the data source toggle) and [`api/README.md`](api/README.md) for backend details (migrations, tests, adding endpoints).

## Scripts

| Command                                 | Description                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`                           | Start the Next.js dev server (frontend only)                                |
| `npm run dev:api`                       | Start the FastAPI backend (uvicorn on :8000)                                |
| `npm run dev:full`                      | Start the frontend and backend together                                     |
| `npm run build`                         | Production build (needs the API running: `/video-games` prerenders from it) |
| `npm run start`                         | Run the production server                                                   |
| `npm run lint`                          | Run ESLint                                                                  |
| `cd api && uv run pytest`               | Python tests (DB tests skip without `DATABASE_URL`)                         |
| `cd api && uv run ruff check .`         | Python lint                                                                 |
| `cd api && uv run alembic upgrade head` | Apply database migrations                                                   |

## Claude Skills

Skills defined in `.claude/skills/` for use with [Claude Code](https://claude.com/claude-code) in this project:

| Skill       | Trigger      | Description                                            |
| ----------- | ------------ | ------------------------------------------------------ |
| `proj-todo` | `/proj-todo` | Owns `TODO.md`: the backlog and the tracked bug list   |
| `explain`   | `/explain`   | Walk through code step-by-step (what it does and how)  |
| `teach`     | `/teach`     | Teach the concepts and "why" behind code or web topics |

Project instructions for Claude live in [`.claude/CLAUDE.md`](.claude/CLAUDE.md).
