# CLAUDE.md

## Project Purpose

Personal website built with **Next.js 15, React 19, TypeScript, and Tailwind CSS v4**, with a **FastAPI (Python) backend** in `api/` and Postgres (Supabase) behind it. The primary goal of this project is **learning frontend development**. A polished website is a welcome side effect, but teaching comes first.

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
- **Keep comments as short as the point allows.** Say the non-obvious "why" and stop. Prefer one or two lines to a paragraph, and cut any sentence restating what the code already says. Length is earned, not assumed: a longer comment is right only when the reasoning genuinely needs it, such as a subtle constraint or a rejected alternative that will otherwise be re-proposed. The teaching happens in chat, where it costs nothing to read past.

## Architecture

**The diagram is [`docs/architecture.md`](../docs/architecture.md)** — read it before changing how data moves. The two paths in one line each:

- **Read** (public, cached): Server Component `LibraryPage.tsx` → `src/lib/libraryApi.ts` (this file imports `server-only` and is the server boundary; there is no `gamesServer.ts`) → `GET /api/library/users/{username}/*` → routers → services → repositories → Postgres.
- **Write** (owner-only, BFF): browser → Server Action `src/app/video-games/actions.ts` → `src/lib/meApi.ts` (session cookie → Bearer JWT) → `/api/library/me/*` → same layers → on success `revalidateTag(libraryCacheTag(...))`.

Filter, group and sort are **client-side**, in `pipeline.ts` — pure functions over the fetched array, no React. The API returns a whole library; the browser narrows it.

Docs ownership, so the same fact does not drift across four files: **`api/README.md`** owns the backend layer map and the data model, **`docs/architecture.md`** owns the request flow, **`README.md`** owns what the project is and how to run it, and this file owns conventions and the map below. Link, don't restate.

### Where things live

| Task                                   | File                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Library read fetches, cache tags       | `src/lib/libraryApi.ts`                                                                                                               |
| Stale/missing catalog data refresh     | `api/app/services/catalog_refresh.py`                                                                                                 |
| Owner writes (client-callable)         | `src/app/video-games/actions.ts` → `src/lib/meApi.ts`                                                                                 |
| Filter / group / sort logic            | `src/components/video_games/pipeline.ts`                                                                                              |
| Filter/group/sort option lists         | `src/components/video_games/libraryConfig.ts`, `useFilterOptions.ts`                                                                  |
| Shared types, `RATINGS`, `systemLabel` | `src/lib/games.ts` (library), `wishlist.ts`, `profile.ts`, `follows.ts`                                                               |
| Shelf UI                               | `GameShelves.tsx` → `ShelfSection.tsx` → `GameCase.tsx`                                                                               |
| Game detail card (click a case)        | `GameDetailCard.tsx`, which flies the case out and renders `GameCaseBackSurface.tsx` + `GameCaseSpine.tsx`                            |
| Library page shell (both routes)       | `src/components/video_games/LibraryPage.tsx`                                                                                          |
| Owner edit surfaces                    | On the detail card: `GameEditFields.tsx`, `WishlistEditFields.tsx`, `GamePlayHistory.tsx`. `AddGameModal.tsx` is the only dialog left |
| Dialog chrome                          | `ModalFrame.tsx` (backdrop, scroll lock, focus, Escape) → `ModalShell.tsx` (the conventional panel), `ModalBackdrop.tsx`              |
| "Currently playing" CRT                | `src/components/crt/CrtTv.tsx` + `crt.css`                                                                                            |
| Can this viewer edit?                  | `FollowControls.tsx` (two hooks), `useViewerRelationship.ts`, `ownedLibrary.ts`                                                       |
| Auth (browser/server/middleware)       | `src/lib/supabase/`, `src/app/auth/*`, `src/app/onboarding/`                                                                          |
| Library styles                         | `src/app/video-games/video-games.css`; site tokens in `src/app/globals.css`                                                           |
| Mobile keyboard / viewport behavior    | [`docs/mobile-viewport.md`](../docs/mobile-viewport.md); `keyboardBand.ts`, `useModalChrome.ts`                                       |
| API endpoints                          | `api/app/routers/` → `services/` → `repositories/` (see `api/README.md`)                                                              |
| API endpoint reference, runnable       | `api/bruno/` (Bruno collection; `test_bruno_collection.py` keeps it in sync)                                                          |
| Migrations                             | `api/alembic/versions/`                                                                                                               |
| Production deploys, migrations in CD   | [`docs/deployment.md`](../docs/deployment.md); `.github/workflows/deploy.yml`                                                         |
| Tests                                  | `api/tests/` (pytest); `src/**/*.test.ts` (`npm test`, node --test, no runner installed)                                              |

Dead code worth knowing about: `src/components/video_games/CurrentlyPlaying.tsx` is the **old** stylized CRT and is imported by nothing. The live one is `crt/CrtTv.tsx`, used by `LibraryPage` and `/currently-playing`.

Gone, so do not go looking: `EditGameModal.tsx` and `EditWishlistModal.tsx` were deleted 2026-08-20 when the detail card absorbed them. Their bodies are the `*EditFields` components above, and the one-Save model they established is what any new owner form should adopt.

## Routes

| Route                           | What it is                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/`                             | Hero photo + frosted-glass tile grid. No nav bar; the tiles are the nav                                    |
| `/about`, `/resume`, `/privacy` | Bio and photo grid; work history + PDF; privacy policy                                                     |
| `/video-games`                  | Robert's library at its stable URL, and the logged-out demo                                                |
| `/video-games/u/[username]`     | Anyone's library. Same `LibraryPage` shell, different username                                             |
| `/video-games/start`            | Sign-in pitch                                                                                              |
| `/video-games/account`          | Account settings (today: delete account)                                                                   |
| `/currently-playing`            | Standalone CRT, no shelves                                                                                 |
| `/library`                      | Redirect-only resolver: logged out → `/video-games`, onboarded → their library, no profile → `/onboarding` |
| `/onboarding`, `/auth/*`        | Username picker; OAuth callback + magic-link confirm route handlers                                        |

## Conventions

- **Never read or write `TODO.md` or `docs/todo/` without invoking the `proj-todo` skill.** It owns the backlog: `TODO.md` is the index and `docs/todo/<slug>.md` holds one item's detail. Adding, removing, completing, reordering, rewording, answering "what's next", and any direct edit — including when you only need its contents to answer something. Conversational phrasings count as much as a typed command. Reads through the skill never modify the file. The structure rules live in the skill and are deliberately not repeated here: when they were duplicated into this always-loaded file, having them already in context is what made the skill feel redundant and got it skipped for a whole session.
- **Never add "Co-Authored-By: Claude" (or any Claude/Anthropic attribution) to git commit messages.**
- **Use `ggp` instead of `git push` when pushing branches.**
- **Never use em dashes (—) in user-facing text.** This covers anything a visitor can read or hear: JSX text, button and heading copy, `aria-label`s, `alt` text, `metadata` titles and descriptions, error messages, placeholder copy. Use a colon when the second half explains the first, a comma for an aside, or split into two sentences. Code comments are exempt, and so is the `—` used as a "no value" placeholder in table-like output. Applies to Markdown that ships as a page (`/privacy`), not to `TODO.md` or docs.
- **Routes use kebab-case, never snake_case** (`/video-games`, `/currently-playing`, `/video-games/start`). Renamed from underscores 2026-07-28; the old URLs are kept alive by permanent redirects in `next.config.ts`, which must stay. Note this is a _URL_ convention — `src/components/video_games/` and snake_case SQL column names (`currently_playing`) are deliberately untouched.
- **The game library owns the `/video-games` prefix.** Everything belonging to it nests there, including per-user libraries at `/video-games/u/[username]` (moved off a top-level `/u/` 2026-07-29, redirect in `next.config.ts`). New library surfaces go under that prefix rather than at the top level. Auth is the deliberate exception: `/onboarding` and `/auth/*` stay top-level because identity is site-wide, not the library's.
- **Always support both light and dark mode.** The site uses `@media (prefers-color-scheme: dark)` CSS variables in `globals.css` and Tailwind `dark:` variants in components — both must be addressed for any new UI. Never add color classes that only work in one mode.
- **Nav height is one variable.** `--nav-height` in `globals.css` (`:root`) is the bar itself, consumed as `h-[var(--nav-height)]` in `Nav.tsx`. `--nav-offset` is that plus `--safe-top`, which is where the bar actually ends, consumed as `top-[var(--nav-offset)]` in `GameShelves.tsx` (the sticky library header, which holds the view tabs and `FilterBar`) and `StatsPanel.tsx`. Change the height in one place and all three follow.
- **Anything touching a software keyboard, a scroll lock, or a dialog's position
  starts at [`docs/mobile-viewport.md`](../docs/mobile-viewport.md).** It carries what
  device captures established, including several fixes that were tried, shipped and
  wrong: the same family of bugs was fixed six times from theory before anything was
  measured. Two of its conclusions are easy to re-break — the browsers on one phone
  use opposite viewport models, and every viewport reading must be believed as it
  arrives rather than held for a settle.
- **The page owns the device safe areas.** `layout.tsx` exports `viewport: { viewportFit: "cover" }`, so iOS stops insetting the page out of the notch and home-indicator strips: page content reaches the screen edges, which is what `ModalBackdrop` relies on to dim them. A `fixed` overlay does not, whatever its insets say: WebKit clips fixed layers to a layout viewport that goes stale when the URL bar shrinks, which is why the backdrop is document-positioned. The cost is that anything pinned to a viewport edge must pad itself back out, via the four `--safe-*` tokens in `globals.css` (all four: covering un-insets left and right too, which matters in landscape). Today that is `Nav`, `StatsPanel`, `ModalShell` and the homepage tiles. `FilterSheet` predates the change and pads its action row with a raw `max(1rem, env(safe-area-inset-bottom))`, so it must not be padded again.
- **Owner affordances that CREATE a row use `useIsConfirmedOwner`, never `useIsLikelyOwner`.** The
  latter includes a cached guess that can be wrong for one round trip, which is fine where the
  server can still refuse (`PATCH`/`DELETE` 404 on another user's row) and unsafe where it cannot
  (`POST /me/games` always writes to the caller's own library). Both live in `FollowControls.tsx`.
- **Adding a read means adding its cache tag.** Tags are defined in `libraryApi.ts` and must be paired with every write that can change them, in `video-games/actions.ts`. Too narrow a tag serves a stale page.

## Repository

- GitHub: https://github.com/robertgrassian/personal_website

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19
- **Language:** TypeScript (strict), Python 3.12 for the API
- **Styling:** Tailwind CSS v4
- **Backend:** FastAPI + SQLAlchemy 2.0 + Alembic, Postgres via Supabase
- **Deployment:** Vercel (Next.js app and the Python function together)

## Commands

- `npm run dev` — Start dev server (Turbopack)
- `npm run dev:api` — Start the FastAPI backend (uvicorn, port 8000)
- `npm run dev:full` — Both of the above at once
- `npm run build` — Production build. **Requires the library API to be running** (`npm run dev:api`):
  `/video-games` and its OG image prerender from it, and an unreachable origin fails the build by
  design rather than shipping an empty library
- `npm run lint` — Run ESLint
- `npm test` — Frontend tests (`node --test`, runs TypeScript directly; no test runner dependency)
- `cd api && uv run pytest` — Python test suite (DB tests skip without `DATABASE_URL`)
- `cd api && uv run ruff check .` — Python lint
- `cd api && uv run alembic upgrade head` — Apply migrations

Local setup start to finish is [`docs/dev-setup.md`](../docs/dev-setup.md).
