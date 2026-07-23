# CLAUDE.md

## Project Purpose

This is a personal website built with **Next.js 15, React 19, TypeScript, and Tailwind CSS v4**. The primary goal of this project is **learning frontend development**. A polished website is a welcome side effect, but teaching comes first.

## How to Work With Me

### Teaching Mode

- **Explain all generated code.** Every code snippet should include an explanation of what it does and why. Don't just produce code — teach the concepts behind it.
- **Prefer guiding over doing.** When possible, describe what needs to be built and let me write the code myself. Offer to review what I write rather than writing it for me. Only generate full implementations when I ask or when the concept has already been taught.
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

### 4. Video Game Library (`/video_games`) — Built

A showcase of every video game I've ever played, backed by Postgres (Supabase) and served by the FastAPI backend. The UI is **"video game shelves"** — game cover art displayed on shelf planks, styled to evoke a home collection or Blockbuster. This section is largely complete:

- Data read server-side via `src/lib/gamesServer.ts` (server-only) → `libraryApi.ts` → `GET /api/py/users/{username}/games`; types and constants in `src/lib/games.ts`. `LIBRARY_API_ORIGIN` must be set (local: `http://127.0.0.1:8000`); there is no CSV fallback (retired in Phase 3)
- Shelf UI with cover art (IGDB URLs stored on each row) and system-colored fallbacks
- Filter bar: search, rating, system, genre
- Group by: system, rating, genre, decade
- Sort within shelves: name, release date, last played
- Owner editing happens in the site UI (add/remove games, rate, log/close sessions, wishlist CRUD + promote) — see the write path below. Cover art for new games comes from the `/api/py/igdb/search` proxy
- Play state is derived by the API from `play_sessions` rows. An **open session** (NULL `end_date`) is the source of truth for "currently playing"; the newest `end_date` is "last played". Each `Game` arrives with `currentlyPlaying`, `lastPlayed`, `playingSince`, `openSessionId`, and `sessionCount` already derived
- "Currently playing" CRT TV above the view tabs (`CurrentlyPlaying.tsx`) shows the first game with an open session, labeled "playing since {start}". Unrated games appear only on the CRT, not the shelves

Owner writes follow the BFF pattern: browser → Server Action (`src/app/video_games/actions.ts`) → `src/lib/meApi.ts` (cookie → Bearer) → FastAPI `/api/py/me/*` → on success `revalidateTag(libraryCacheTag(...))`. The full backend lives in `api/` (routers → services → repositories); migrations via Alembic. A frozen CSV snapshot in `api/scripts/fixtures/` seeds a local dev DB (`cd api && uv run python scripts/seed.py`) and is not read by the running site.

Remaining ideas are tracked in `TODO.md` (backlog).

### 5. Site-wide Navigation — Built

`src/components/Nav.tsx` — a sticky nav bar rendered in the root layout. Uses Caveat (Google Font, weight 700) for the site name. Hidden on `/` since the homepage has its own tile navigation. The nav height is defined as `--nav-height` in `globals.css` (`:root`) and consumed via `h-[var(--nav-height)]` in `Nav.tsx` and `top-[var(--nav-height)]` in `FilterBar.tsx` — change it in one place and both update.

## Conventions

- When I ask "what's next" or similar (e.g., "what should I work on"), reference `TODO.md` for the answer. Don't explore the codebase — just read the TODO and summarize what's up next.
- **Never add "Co-Authored-By: Claude" (or any Claude/Anthropic attribution) to git commit messages.**
- **Use `ggp` instead of `git push` when pushing branches.**
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
- `npm run build` — Production build
- `npm run lint` — Run ESLint
