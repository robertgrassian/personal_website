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

**Read [`docs/architecture.md`](../docs/architecture.md) before changing how data moves** (reads: public, cached, server-side; writes: owner-only, Server Action to API, then `revalidateTag`).

**Every library read happens in `LibraryPage`'s one `Promise.all`.** Nothing the library shows is fetched from the browser afterwards, so display components have no loading state and one `revalidateTag` reaches every surface. Filter, group and sort are client-side pure functions in `pipeline.ts`.

Docs ownership, so facts don't drift: `api/README.md` owns the backend layers and data model, `docs/architecture.md` the request flow, `README.md` what the project is and how to run it, this file conventions. Link, don't restate.

### Pointers that carry a constraint

- Stats SQL tab: the examples in `queryTables.ts` are executed by `queryTables.test.ts`
- Owner edit surfaces: new owner forms adopt the detail card's one-Save model (`GameDetailCard.tsx`)
- Dialog chrome: `ModalFrame.tsx` owns backdrop, scroll lock, focus and Escape; don't reimplement them
- Produce tracking is private, per account, and needs no profile: `useTastings.ts` reads from the browser with the session JWT and writes optimistically via `src/app/produce/actions.ts`
- `src/lib/produce/sketch.ts` is server-only and the one place rough.js is imported
- API endpoint reference: `api/bruno/` (kept in sync by `test_bruno_collection.py`)
- Deploys and migrations in CD: [`docs/deployment.md`](../docs/deployment.md)

## Conventions

- **Never read or write `TODO.md` or `docs/todo/` without invoking the `proj-todo` skill**, including reads and conversational requests. Its rules live in the skill on purpose.
- **No em dashes (—) in user-facing text**: JSX copy, `aria-label`, `alt`, metadata, error messages, placeholders, shipped Markdown like `/privacy`. Use a colon, a comma, or two sentences. Code comments and docs are exempt.
- **Routes are kebab-case.** The permanent redirects from the old snake_case URLs in `next.config.ts` must stay. Folder names and SQL columns stay snake_case.
- **The library owns `/video-games`.** New library surfaces nest under it (per-user libraries are `/video-games/u/[username]`). Identity is site-wide, so `/sign-in`, `/account`, `/onboarding` and `/auth/*` stay top-level. **Do not move or retitle `/video-games/start`**: it is Google's OAuth "App homepage".
- **One login, many apps.** Signing in creates a site account and nothing else, and never forces onboarding: a signed-in visitor with no game library profile is a complete state. An app's per-user data is made when the visitor asks for it, and new per-user tables key on the auth user, not on `profiles`.
- **The shelf is a theme, not a layout.** A theme owns only how one group of games is laid out and its surface tokens in `shelf-themes.css`; the pipeline, chrome, `GameCase` and detail card are shared. Adding a theme means a name, a component and a token block. The OG image always draws the built-in case.
- **The wood grain is baked, not inlined.** Edit a profile in `scripts/wood-grain/tiles/`, run `npm run grain`, commit the output. Read [`scripts/wood-grain/README.md`](../scripts/wood-grain/README.md) before changing how it works: it lists approaches that were tried and are wrong.
- **The accent color is a switch, not a literal.** `ACTIVE_ACCENT` in `src/lib/accent.ts` picks a `[data-accent]` palette in `globals.css`. Use `--link`/`text-link`, `--accent-on-dark` (surfaces dark in both schemes), `--accent-glow`. Never write an accent literal (no `amber-*`).
- **Always support light and dark mode**, via the CSS variables in `globals.css` and Tailwind `dark:` variants.
- **Keyboards, scroll locks, dialog positioning and safe areas start at [`docs/mobile-viewport.md`](../docs/mobile-viewport.md).** Several fixes there were shipped from theory and were wrong. Anything pinned to a viewport edge pads itself with the `--safe-*` tokens.
- **Owner affordances that CREATE a row use `useIsConfirmedOwner`, never `useIsLikelyOwner`.** The latter can be wrong for one round trip, which only matters where the server can't refuse (`POST /me/games` always writes to the caller's library).
- **Public reads carry public fields only.** Library reads are cached and shared between viewers, so a per-viewer field cannot go on them. Today: wishlist notes (`MyWishlistGameRead` via `GET /me/wishlist/{id}`, guarded by `test_public_wishlist_never_carries_notes`) and game notes (`game_notes`, `GET /me/games/{id}/note`).
- **Adding a read means adding its cache tag** in `libraryApi.ts`, paired with every write in `actions.ts` that can change it. Uncached owner-only `/me` reads have no tag.

## Commands

See `README.md` for the full list and [`docs/dev-setup.md`](../docs/dev-setup.md) for setup. Non-obvious:

- `npm run build` **requires the API running** (`npm run dev:api`): `/video-games` prerenders from it and an unreachable origin fails the build by design.
- `npm test` is `node --test` running TypeScript directly; no runner installed.
- `cd api && uv run pytest` silently skips DB tests without `DATABASE_URL`. Lint with `uv run ruff check .`.
