# CLAUDE.md

## Project Purpose

Personal website: Next.js 15 / React 19 / TypeScript / Tailwind v4, with a FastAPI backend in `api/` over Postgres (Supabase). The primary goal is **learning frontend development**; a polished site is a side effect.

## How to Work With Me

- **Explain all generated code**: what it does and why. Teach the concepts, don't just produce code.
- **Implement, don't hand back exercises.** Write the code yourself and teach through how you explain it.
- **Use my backend knowledge as a bridge** (staff backend engineer: Java, Spring, SQL, Clickhouse, MongoDB), but only when the comparison genuinely clarifies.
- Call out whether something is a Next.js, React, or general web/JS/TS convention, and briefly give tradeoffs when there are multiple valid approaches.
- **Code comments:** short and technical. Comment non-obvious patterns (especially React idioms), state the "why" and stop, never restate the code. No analogies in comments; those belong in chat. Length is earned only by a subtle constraint or a rejected alternative that would otherwise be re-proposed.

## Architecture

**Read [`docs/architecture.md`](../docs/architecture.md) before changing how data moves.** In one line each:

- **Read** (public, cached): Server Component `LibraryPage.tsx` → `src/lib/libraryApi.ts` (the `server-only` boundary) → `GET /api/library/users/{username}/*` → routers → services → repositories → Postgres.
- **Write** (owner-only, BFF): browser → Server Action `src/app/video-games/actions.ts` → `src/lib/meApi.ts` (session cookie → Bearer JWT) → `/api/library/me/*` → on success `revalidateTag(libraryCacheTag(...))`.

**Every library read happens in `LibraryPage`'s one `Promise.all`.** Nothing the library shows is fetched from the browser afterwards, so display components have no loading state and one `revalidateTag` reaches every surface. Filter, group and sort are client-side pure functions in `pipeline.ts`.

Docs ownership, so facts don't drift: `api/README.md` owns the backend layers and data model, `docs/architecture.md` the request flow, `README.md` what the project is and how to run it, this file conventions. Link, don't restate.

### Where things live

- Library read fetches, cache tags: `src/lib/libraryApi.ts`
- Owner writes: `src/app/video-games/actions.ts` → `src/lib/meApi.ts`
- Catalog refresh / new catalog rows: `api/app/services/catalog_refresh.py` / `catalog_sourcing.py`
- Filter/group/sort: `src/components/video_games/pipeline.ts`; option lists in `libraryConfig.ts`, `useFilterOptions.ts`
- Stats SQL tab: `SqlQueryPanel.tsx` (UI), `queryTables.ts` (tables, columns, examples; executed by `queryTables.test.ts`)
- Shared types: `src/lib/games.ts` (incl. `RATINGS`, `systemLabel`), `wishlist.ts`, `profile.ts`, `follows.ts`, `notes.ts`
- Shelf UI: `GameShelves.tsx` → active theme's group in `shelves/` → `GameCase.tsx`. Theme switch: `src/lib/shelfTheme.ts`, `shelves/index.ts`
- Game detail card: `GameDetailCard.tsx` (+ `GameCaseBackSurface.tsx`, `GameCaseSpine.tsx`). Opened from the CRT via `useScreenReveal.ts` and `GameCardOpenerProvider` in `LibraryCardContext.tsx`
- Owner edit surfaces: `GameEditFields.tsx`, `WishlistEditFields.tsx`, `GamePlayHistory.tsx` on the detail card; dialogs `AddGameModal.tsx`, `CurrentlyPlayingPanel.tsx`. New owner forms adopt the detail card's one-Save model
- Dialog chrome: `ModalFrame.tsx` (backdrop, scroll lock, focus, Escape) → `ModalShell.tsx`, `ModalBackdrop.tsx`
- CRT: `src/components/crt/CrtTv.tsx` + `crt.css`, wrapped by `CurrentlyPlayingSection.tsx`
- Can this viewer edit?: `FollowControls.tsx`, `useViewerRelationship.ts`, `ownedLibrary.ts`
- Produce page: `src/app/produce/` (routes, `produce.css`, state-cookie Server Action) → `src/components/produce/ProduceBrowser.tsx`; state redirect in `src/middleware.ts` via `resolveState.ts`
- Produce tracking (private, per account, no profile needed): `useTastings.ts` (browser read with the session JWT, optimistic writes) → `src/app/produce/actions.ts` → `meApi.ts` → `/me/produce/tastings` (`api/app/routers/produce.py`). Pure helpers in `src/lib/produce/tastings.ts`
- Produce data: `src/lib/produce/` (`catalog.ts`, `regions/`, `states.ts`, `season.ts`). `sketch.ts` is server-only and the one place rough.js is imported
- Auth: `src/lib/supabase/`, `src/app/auth/*`, `src/app/sign-in/` + `src/components/auth/SignInPanel.tsx`, `src/lib/nextPath.ts` (the `next` guard), `src/app/account/`, `src/app/onboarding/`
- Styles: `video-games.css` (shared), `shelf-themes.css` (per theme), both in `src/app/video-games/`; site tokens in `src/app/globals.css`
- API endpoint reference: `api/bruno/` (kept in sync by `test_bruno_collection.py`)
- Deploys and migrations in CD: [`docs/deployment.md`](../docs/deployment.md)

## Conventions

- **Never read or write `TODO.md` or `docs/todo/` without invoking the `proj-todo` skill**, including reads and conversational requests. Its rules live in the skill on purpose.
- **Never add "Co-Authored-By: Claude" (or any Claude/Anthropic attribution) to commit messages.**
- **No em dashes (—) in user-facing text**: JSX copy, `aria-label`, `alt`, metadata, error messages, placeholders, shipped Markdown like `/privacy`. Use a colon, a comma, or two sentences. Code comments and docs are exempt.
- **Routes are kebab-case.** The permanent redirects from the old snake_case URLs in `next.config.ts` must stay. Folder names and SQL columns stay snake_case.
- **The library owns `/video-games`.** New library surfaces nest under it (per-user libraries are `/video-games/u/[username]`). Identity is site-wide, so `/sign-in`, `/account`, `/onboarding` and `/auth/*` stay top-level. **Do not move or retitle `/video-games/start`**: it is Google's OAuth "App homepage".
- **One login, many apps.** Signing in creates a site account and nothing else, and never forces onboarding: a signed-in visitor with no game library profile is a complete state. An app's per-user data is made when the visitor asks for it, and new per-user tables key on the auth user, not on `profiles`.
- **The shelf is a theme, not a layout.** A theme owns only how one group of games is laid out and its surface tokens in `shelf-themes.css`; the pipeline, chrome, `GameCase` and detail card are shared. Adding a theme means a name, a component and a token block. The OG image always draws the built-in case.
- **The wood grain is baked, not inlined.** Edit a profile in `scripts/wood-grain/tiles/`, run `npm run grain`, commit the output. Read [`scripts/wood-grain/README.md`](../scripts/wood-grain/README.md) before changing how it works: it lists approaches that were tried and are wrong.
- **The accent color is a switch, not a literal.** `ACTIVE_ACCENT` in `src/lib/accent.ts` picks a `[data-accent]` palette in `globals.css`. Use `--link`/`text-link`, `--accent-on-dark` (surfaces dark in both schemes), `--accent-glow`. Never write an accent literal (no `amber-*`).
- **Always support light and dark mode**, via the CSS variables in `globals.css` and Tailwind `dark:` variants.
- **Nav height is one variable**: `--nav-height`; `--nav-offset` adds `--safe-top` and is what sticky elements use.
- **Keyboards, scroll locks, dialog positioning and safe areas start at [`docs/mobile-viewport.md`](../docs/mobile-viewport.md).** Several fixes there were shipped from theory and were wrong. Anything pinned to a viewport edge pads itself with the `--safe-*` tokens.
- **Owner affordances that CREATE a row use `useIsConfirmedOwner`, never `useIsLikelyOwner`.** The latter can be wrong for one round trip, which only matters where the server can't refuse (`POST /me/games` always writes to the caller's library).
- **Public reads carry public fields only.** Library reads are cached and shared between viewers, so a per-viewer field cannot go on them. Today: wishlist notes (`MyWishlistGameRead` via `GET /me/wishlist/{id}`, guarded by `test_public_wishlist_never_carries_notes`) and game notes (`game_notes`, `GET /me/games/{id}/note`).
- **Adding a read means adding its cache tag** in `libraryApi.ts`, paired with every write in `actions.ts` that can change it. Uncached owner-only `/me` reads have no tag.

## Commands

See `README.md` for the full list and [`docs/dev-setup.md`](../docs/dev-setup.md) for setup. Non-obvious:

- `npm run build` **requires the API running** (`npm run dev:api`): `/video-games` prerenders from it and an unreachable origin fails the build by design.
- `npm test` is `node --test` running TypeScript directly; no runner installed.
- `cd api && uv run pytest` silently skips DB tests without `DATABASE_URL`. Lint with `uv run ruff check .`.
