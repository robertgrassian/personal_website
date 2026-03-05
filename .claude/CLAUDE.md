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

### 1. Resume / About Me (root)

The homepage should function as a personal website / interactive resume — professional background, skills, projects, and contact info. This section is in progress — the structure exists but content and design polish are still evolving.

### 2. Video Game Library (`/video_games`) — Built

A showcase of every video game I've ever played, driven by `games.csv` at the project root. The UI is **"video game shelves"** — game cover art displayed on shelf planks, styled to evoke a home collection or Blockbuster. This section is largely complete:

- CSV-driven data parsed server-side via `src/lib/games.ts`
- Shelf UI with cover art (fetched via IGDB) and system-colored fallbacks
- Filter bar: search, rating, system, genre
- Group by: system, rating, genre, decade
- Sort within shelves: name, release date, first played
- Cover art fetched via `scripts/fetch-covers.ts` using the IGDB API

Remaining ideas are tracked in `TODO.md` (backlog).

## Conventions

- When I ask "what's next" or similar (e.g., "what should I work on"), reference `TODO.md` for the answer. Don't explore the codebase — just read the TODO and summarize what's up next.
- **Never add "Co-Authored-By: Claude" (or any Claude/Anthropic attribution) to git commit messages.**
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
