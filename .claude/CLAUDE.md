# CLAUDE.md

## Project Purpose

This is a personal website built with **Next.js 15, React 19, TypeScript, and Tailwind CSS v4**. The primary goal of this project is **learning frontend development**. A polished website is a welcome side effect, but teaching comes first.

## How to Work With Me

### Teaching Mode

- **Explain all generated code.** Every code snippet should include an explanation of what it does and why. Don't just produce code — teach the concepts behind it.
- **Implement, don't hand back exercises.** Write the code yourself and teach through it. Don't offer to let me write it instead, and don't hold back an implementation waiting for me to try first. The teaching happens in how you explain what you built, not in making me build it. (This replaced an earlier "prefer guiding over doing" rule, retired 2026-07-29 once the basics were no longer the bottleneck.)
- **Use my backend knowledge as a bridge.** I'm a staff backend engineer experienced with Java, Spring, SQL, Clickhouse, and MongoDB. When a frontend concept maps well to something from that world, use the comparison to accelerate understanding — but only when it genuinely clarifies things, not for every concept.

### When Generating Code

- Add inline comments for non-obvious patterns, especially React-specific idioms (hooks, component lifecycle, state management, JSX patterns).
- Call out when something is a Next.js convention vs a React convention vs a general web/JS/TS pattern, so I build the right mental model of where concepts live.
- If there are multiple valid approaches, briefly explain the tradeoffs so I learn to evaluate options.
- **Do not include analogies in code comments.** Keep comments descriptive and technical. Analogies belong in chat explanations, not in source files.

## Project Vision

### 1. Homepage (`/`) — Built

A full-bleed hero photo (San Pedro cliffs) with a frosted-glass tile grid at the bottom linking to About, Game Library, and Resume. No nav bar — the tiles serve as the navigation.

### 2. About Me (`/about`) — Built

Bio, social links (GitHub, LinkedIn), and a masonry photo grid. Content and design may evolve.

### 3. Resume (`/resume`) — Built

Work history, skills, and a PDF download link.

### 4. Video Game Library (`/video-games`) — Built

A showcase of every video game I've ever played, backed by Postgres (Supabase) and served by the FastAPI backend. The UI is **"video game shelves"** — game cover art displayed on shelf planks, styled to evoke a home collection or Blockbuster. This section is largely complete:

- Data read server-side via `src/lib/gamesServer.ts` (server-only) → `libraryApi.ts` → `GET /api/py/users/{username}/games`; types and constants in `src/lib/games.ts`. `LIBRARY_API_ORIGIN` must be set (local: `http://127.0.0.1:8000`); there is no CSV fallback (retired in Phase 3)
- Shelf UI with cover art (IGDB URLs stored on each row) and system-colored fallbacks
- Filter bar: search, rating, system, genre
- Group by: system, rating, genre, decade
- Sort within shelves: name, release date, last played
- Owner editing happens in the site UI (add/remove games, rate, log/close sessions, wishlist CRUD + promote) — see the write path below. Cover art for new games comes from the `/api/py/igdb/search` proxy
- Play state is derived by the API from `play_sessions` rows. An **open session** (NULL `end_date`) is the source of truth for "currently playing"; the newest `end_date` is "last played". Each `Game` arrives with `currentlyPlaying`, `lastPlayed`, `playingSince`, `openSessionId`, and `sessionCount` already derived
- "Currently playing" CRT TV above the view tabs (`CrtTv.tsx`) cycles through every game with an open session like TV channels, each labeled "playing since {start}". Unrated games are ordinary library members: they sit on the shelves with everything else, are matched by every filter, and are counted in the headline. `groupBy: "rating"` collects them under "Unrated" (pinned last), and the rating filter has an "Unrated" option. A game that is both unrated and in progress therefore appears on the CRT _and_ on a shelf, which is the same double-billing a rated in-progress game has always had

Owner writes follow the BFF pattern: browser → Server Action (`src/app/video-games/actions.ts`) → `src/lib/meApi.ts` (cookie → Bearer) → FastAPI `/api/py/me/*` → on success `revalidateTag(libraryCacheTag(...))`. The full backend lives in `api/` (routers → services → repositories); migrations via Alembic. A frozen CSV snapshot in `api/scripts/fixtures/` seeds a local dev DB (`cd api && uv run python scripts/seed.py`) and is not read by the running site.

Remaining ideas are tracked in `TODO.md` (backlog).

### 5. Site-wide Navigation — Built

`src/components/Nav.tsx` — a sticky nav bar rendered in the root layout. Uses Caveat (Google Font, weight 700) for the site name. Hidden on `/` since the homepage has its own tile navigation. The nav height is defined as `--nav-height` in `globals.css` (`:root`) and consumed via `h-[var(--nav-height)]` in `Nav.tsx` and `top-[var(--nav-height)]` in `FilterBar.tsx` — change it in one place and both update.

## Conventions

- **Never read or write `TODO.md` without invoking the `proj-todo` skill.** It owns that file: adding, removing, completing, reordering, rewording, answering "what's next", and any direct edit — including when you only need its contents to answer something. Conversational phrasings count as much as a typed command. Reads through the skill never modify the file. The structure rules live in the skill and are deliberately not repeated here: when they were duplicated into this always-loaded file, having them already in context is what made the skill feel redundant and got it skipped for a whole session.
- **Never add "Co-Authored-By: Claude" (or any Claude/Anthropic attribution) to git commit messages.**
- **Use `ggp` instead of `git push` when pushing branches.**
- **Never use em dashes (—) in user-facing text.** This covers anything a visitor can read or hear: JSX text, button and heading copy, `aria-label`s, `alt` text, `metadata` titles and descriptions, error messages, placeholder copy. Use a colon when the second half explains the first, a comma for an aside, or split into two sentences. Code comments are exempt, and so is the `—` used as a "no value" placeholder in table-like output. Applies to Markdown that ships as a page (`/privacy`), not to `TODO.md` or docs.
- **Routes use kebab-case, never snake_case** (`/video-games`, `/currently-playing`, `/video-games/start`). Renamed from underscores 2026-07-28; the old URLs are kept alive by permanent redirects in `next.config.ts`, which must stay. Note this is a _URL_ convention — `src/components/video_games/` and snake_case SQL column names (`currently_playing`) are deliberately untouched.
- **The game library owns the `/video-games` prefix.** Everything belonging to it nests there, including per-user libraries at `/video-games/u/[username]` (moved off a top-level `/u/` 2026-07-29, redirect in `next.config.ts`). New library surfaces go under that prefix rather than at the top level. Auth is the deliberate exception: `/onboarding` and `/auth/*` stay top-level because identity is site-wide, not the library's.
- **Always support both light and dark mode.** The site uses `@media (prefers-color-scheme: dark)` CSS variables in `globals.css` and Tailwind `dark:` variants in components — both must be addressed for any new UI. Never add color classes that only work in one mode.

## Repository

- GitHub: https://github.com/robertgrassian/personal_website

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Deployment:** Vercel

## Commands

- `npm run dev` — Start dev server (Turbopack)
- `npm run dev:api` — Start the FastAPI backend (uvicorn, port 8000)
- `npm run dev:full` — Both of the above at once
- `npm run build` — Production build. **Requires the library API to be running** (`npm run dev:api`):
  `/video-games` and its OG image prerender from it, and an unreachable origin fails the build by
  design rather than shipping an empty library
- `npm run lint` — Run ESLint
- `cd api && uv run pytest` — Python test suite (integration tests need `DATABASE_URL`)
- `cd api && uv run ruff check .` — Python lint
