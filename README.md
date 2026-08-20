# Robert Grassian — Personal Website

[rgrassian.com](https://rgrassian.com)

A personal site with a resume and an interactive video game library: Google
sign-in, a shared game catalog, per-user shelves, play sessions, wishlists, and
a follow graph. React 19 and the Next.js App Router on the front, a typed
FastAPI service over Postgres behind it.

## Features

- **Home** — Full-bleed hero with navigation tiles linking to each section
- **About** — Bio, photos, and social links
- **Resume** — Work experience (Harness, Split Software, Cisco), education (UC Berkeley), and skills
- **Game Library** — See below

A sticky site-wide nav links all sections. The homepage is nav-free: it has its
own tile navigation.

## The Game Library

Every game I have played, on shelves. Cover art sits on wooden planks, each case
flips to a back face with its metadata, and a CRT television above the shelves
cycles through whatever I am currently playing.

**Anyone** can search, filter by rating, system or genre, group by system,
rating, genre or decade, and sort within each shelf. It runs client-side over an
already-loaded library, so it is instant and the whole view is captured in the
URL. A stats panel adds a SQL console that runs real `SELECT`s against the
library in the browser via [AlaSQL](https://alasql.org).

**Signed in**, you own a library: add games through an
[IGDB](https://www.igdb.com) search that brings its own cover art, rate them,
start and stop play sessions, log past playthroughs, keep a wishlist, and follow
other people. Libraries live at `/video-games/u/{username}`; mine keeps the
original `/video-games` URL and doubles as the logged-out demo.

## Architecture

**[`docs/architecture.md`](docs/architecture.md) has the diagram and the
detail.** In short: the browser never talks to Postgres. Next.js is a
backend-for-frontend that renders pages on the server and brokers every write,
and FastAPI is the only thing holding a database connection.

- **Reads are public and cached.** A Server Component fetches through
  `src/lib/libraryApi.ts` (which imports `server-only`, so bundling it into the
  browser is a build error) and hits `/api/library/users/{username}/*`.
- **Writes are owner-only.** A Server Action in `src/app/video-games/actions.ts`
  calls `src/lib/meApi.ts`, which exchanges the session cookie for a Bearer JWT
  and hits `/api/library/me/*`, then invalidates the affected cache tags. The browser
  never holds an API token of its own.

Docs are split so the same fact is not written in four places:
[`docs/architecture.md`](docs/architecture.md) owns the request flow,
[`api/README.md`](api/README.md) the backend layer map and data model,
[`docs/dev-setup.md`](docs/dev-setup.md) local setup, and
[`docs/supabase-primer.md`](docs/supabase-primer.md) why Supabase is not used as
a backend-as-a-service.

The instanced game libraries spec, `docs/plans/instanced-game-libraries.md`, was
deleted on 2026-07-30 once every part of it had shipped: the auth model and the
design decisions that still explain the code moved into this file, the data model
and its rationale into `api/README.md`, and its Supabase argument survives as
`docs/supabase-primer.md`. Anything still outstanding from it is in `TODO.md`.

## Tech Stack

- [Next.js 15](https://nextjs.org) (App Router, React 19, Turbopack), [TypeScript](https://www.typescriptlang.org) (strict), [Tailwind CSS 4](https://tailwindcss.com)
- [FastAPI](https://fastapi.tiangolo.com) + [SQLAlchemy 2.0](https://www.sqlalchemy.org) + [Alembic](https://alembic.sqlalchemy.org), Python 3.12
- [Supabase](https://supabase.com) for Postgres and auth; deployed on [Vercel](https://vercel.com)
- ESLint, Prettier and Husky on the frontend; [Ruff](https://docs.astral.sh/ruff) and pytest on the backend

## Authentication

Google (OpenID Connect) via Supabase Auth, which owns the user store and mints
the session token: a signed JWT (ES256). Authorization is the FastAPI backend's
job, not Supabase's. It verifies the JWT locally against Supabase's JWKS
endpoint, with no per-request round-trip, and enforces access in application
code: reads public, writes owner-only (`jwt.sub == row.user_id`). Row-Level
Security is deliberately unused, because the browser never talks to Postgres and
FastAPI is its only client.

## Design decisions

| Decision                                  | Why                                                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All libraries public**                  | No private-library setting, which is what lets pages be statically cached and shared across viewers.                                                                 |
| **Per-viewer UI resolves client-side**    | Cached payloads carry public data only, so owner controls and follow buttons resolve after hydration. Otherwise one viewer's state leaks into another's cached HTML. |
| **A shared catalog, plus per-user rows**  | `game_metadata` holds the game; per-user tables hold only what differs between people. Two owners of one game can never disagree about it.                           |
| **Play state is derived, not stored**     | An open play session is the source of truth for "currently playing", so no boolean can drift out of sync with it.                                                    |
| **`/video-games` stays Robert's library** | Its URL never moved, so existing links keep working, and it doubles as the logged-out demo.                                                                          |
| **The build fails on an unreachable API** | `/video-games` prerenders from the API, and there is no fallback: a fallback ships a plausible-looking empty library instead of a loud error.                        |

## Getting Started

Prerequisites: [Docker](https://www.docker.com), [uv](https://docs.astral.sh/uv),
and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start                                    # local Postgres, Auth, Studio, Mailpit
cp .env.example .env                              # values from `supabase status -o env`
cd api && uv sync && uv run alembic upgrade head && uv run python scripts/seed.py && cd ..
npm run dev:full                                  # Next.js :3000 + FastAPI :8000
```

Local sign-in uses magic links captured by [Mailpit](http://127.0.0.1:54324);
production uses Google. Full setup, resets and troubleshooting are in
[`docs/dev-setup.md`](docs/dev-setup.md).

## Scripts

| Command                                 | Description                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev` / `dev:api` / `dev:full`  | Next.js only / FastAPI only / both                                          |
| `npm run build`                         | Production build (needs the API running: `/video-games` prerenders from it) |
| `npm run lint`                          | ESLint                                                                      |
| `cd api && uv run pytest`               | Python tests (DB tests skip without `DATABASE_URL`)                         |
| `cd api && uv run ruff check .`         | Python lint                                                                 |
| `cd api && uv run alembic upgrade head` | Apply migrations                                                            |

## Claude Skills

Skills in `.claude/skills/` for use with [Claude Code](https://claude.com/claude-code):
`proj-todo` (owns the backlog and bug list: `TODO.md` as the index, with
per-item detail in `docs/todo/`), `explain` (walk through
code step by step), and `teach` (the concepts behind it). Project instructions
live in [`.claude/CLAUDE.md`](.claude/CLAUDE.md).
