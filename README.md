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

| Skill      | Trigger     | Description                                            |
| ---------- | ----------- | ------------------------------------------------------ |
| `add-game` | `/add-game` | Add a game to `games.csv` with cover art from IGDB     |
| `todo`     | `/todo`     | Manage the project TODO list (add, list, done, do)     |
| `explain`  | `/explain`  | Walk through code step-by-step (what it does and how)  |
| `teach`    | `/teach`    | Teach the concepts and "why" behind code or web topics |
