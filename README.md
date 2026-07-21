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

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command         | Description                     |
| --------------- | ------------------------------- |
| `npm run dev`   | Start dev server with Turbopack |
| `npm run build` | Production build                |
| `npm run start` | Run production server           |
| `npm run lint`  | Run ESLint                      |

## Game Library Data

Game data lives in `games.csv`. Cover art is sourced from the [IGDB API](https://api-docs.igdb.com).

To fetch/refresh cover art:

```bash
CLIENT_ID=<igdb_client_id> CLIENT_SECRET=<igdb_client_secret> npx tsx scripts/fetch-covers.ts
```

## Claude Skills

Slash commands defined in `.claude/skills/` for use with Claude Code in this project:

| Skill      | Trigger     | Description                                                                       |
| ---------- | ----------- | --------------------------------------------------------------------------------- |
| `add-game` | `/add-game` | Add a game to `games.csv` with cover art from IGDB                                |
| `session`  | `/session`  | Log a play session — start/stop currently playing (CRT TV) or backfill a past one |
| `todo`     | `/todo`     | Manage the project TODO list (add, list, done, do)                                |
| `explain`  | `/explain`  | Walk through code step-by-step (what it does and how)                             |
| `teach`    | `/teach`    | Teach the concepts and "why" behind code or web topics                            |
