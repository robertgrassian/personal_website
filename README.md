# Robert Grassian — Personal Website

Personal website built with Next.js 15. Includes a resume page and an interactive video game library browser.

## Features

- **Home** — Bio and navigation
- **Resume** — Work experience (Harness, Split Software, Cisco), education (UC Berkeley), and skills
- **Game Library** — Browsable shelf of 100+ games with filtering by rating, system, and genre; grouping by system/rating/genre/decade; and six sort options. Cover art sourced from IGDB.

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
