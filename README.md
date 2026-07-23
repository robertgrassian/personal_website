# Robert Grassian — Personal Website

Personal website built with Next.js 15. Includes a resume page and an interactive video game library browser.

## Features

- **Home** — Full-bleed hero with navigation tiles linking to each section
- **About** — Bio, photos, and social links
- **Resume** — Work experience (Harness, Split Software, Cisco), education (UC Berkeley), and skills
- **Game Library** — Browsable shelf of 100+ games with filtering by rating, system, and genre; grouping by system/rating/genre/decade; and six sort options. Cover art sourced from IGDB.

A persistent site-wide nav bar (Caveat font, sticky) links all sections. The homepage is nav-free — it has its own tile navigation.

## Tech Stack

- [Next.js 15](https://nextjs.org) (App Router, React 19, Turbopack)
- [TypeScript](https://www.typescriptlang.org) (strict mode)
- [Tailwind CSS 4](https://tailwindcss.com)
- ESLint + Prettier + Husky pre-commit hooks

## Authentication

Users sign in with **Google** (OpenID Connect). Supabase Auth brokers that sign-in and, once Google has verified the user's identity, mints the site's own session token — a signed JWT (ES256) — and owns the user store (`auth.users`). Google's only job is proving _who_ the user is; the token the app actually uses is issued by Supabase, not Google.

Authorization is handled by a **FastAPI (Python) backend**, not by Supabase. On each request FastAPI verifies the JWT locally against Supabase's public keys (its JWKS endpoint) — no per-request round-trip to Supabase — and enforces access in application code: reads are public, writes are owner-only (`jwt.sub == row.user_id`). We deliberately don't use Supabase as a backend-as-a-service or its Row-Level Security — the browser never talks to the database, and FastAPI is its only client. Full detail lives in [`docs/plans/instanced-game-libraries.md`](docs/plans/instanced-game-libraries.md) (§5, Auth) and [`api/README.md`](api/README.md).

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

# 3. Migrate and seed the database (from api/)
cd api
uv run alembic upgrade head
uv run python scripts/seed.py
cd ..

# 4. Start Next.js and FastAPI together
npm run dev:full
```

Open [http://localhost:3000](http://localhost:3000). Local sign-in uses **magic links** (production uses Google) — the email is captured by [Mailpit](http://127.0.0.1:54324); click the link to finish signing in. The database UI (Supabase Studio) is at [http://127.0.0.1:54323](http://127.0.0.1:54323). See [`api/README.md`](api/README.md) for backend details (migrations, tests, adding endpoints).

## Scripts

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Start the Next.js dev server (frontend only) |
| `npm run dev:api`  | Start the FastAPI backend (uvicorn on :8000) |
| `npm run dev:full` | Start the frontend and backend together      |
| `npm run build`    | Production build                             |
| `npm run start`    | Run the production server                    |
| `npm run lint`     | Run ESLint                                   |

## Game Library Data

Game, session, and wishlist data live in Postgres (Supabase), served by the
FastAPI backend under `/api/py`. The library is edited through the site itself
(add/remove games, rate, log sessions, manage the wishlist) — no CSV commits.
Cover art is sourced from the [IGDB API](https://api-docs.igdb.com) via the
authenticated `/api/py/igdb/search` proxy when adding a game.

A frozen CSV snapshot in `api/scripts/fixtures/` is the seed source for a local
dev database (`cd api && uv run python scripts/seed.py`); it is not read by the
running site.

## Claude Skills

Slash commands defined in `.claude/skills/` for use with Claude Code in this project:

| Skill     | Trigger    | Description                                            |
| --------- | ---------- | ------------------------------------------------------ |
| `todo`    | `/todo`    | Manage the project TODO list (add, list, done, do)     |
| `explain` | `/explain` | Walk through code step-by-step (what it does and how)  |
| `teach`   | `/teach`   | Teach the concepts and "why" behind code or web topics |
