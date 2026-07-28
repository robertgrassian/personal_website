# Project TODO

## Up Next

**Pending manual steps — game library backend (Vercel/prod dashboards, ~10 min total):**

- [ ] **Confirm the prod CSV → Postgres cutover** (no longer a manual env-var step):
      the read/write origin resolver now falls back to `VERCEL_PROJECT_PRODUCTION_URL`
      when `LIBRARY_API_ORIGIN` is unset, so prod cuts over to the API **automatically**
      on the first deploy after PR #64 merges (which removes the CSV files). Nothing to
      set in Vercel. After that deploy: load `/video_games` to confirm it renders from
      Postgres, click a rating to confirm the optimistic UI converges, and note the
      first-write latency (stacked Node+Python cold start). If you ever want to pin the
      origin explicitly instead of self-resolving, you _can_ set `LIBRARY_API_ORIGIN`,
      but it's optional now.<br>
      **Preview caveat:** `VERCEL_PROJECT_PRODUCTION_URL` is set on preview deploys too
      and points at the production domain, so a preview deploy _reads_ production's
      library. Writes from a preview are refused client-side
      (`targetsForeignEnvironmentApi` in `libraryApi.ts`) because the API's
      `forbid_in_preview` can't see them — it reads production's `APP_ENV`, not the
      preview deploy's. To let a preview write again, point it at its own API with a
      Preview-scoped `LIBRARY_API_ORIGIN`.
- [ ] **After merging PR #63** (IGDB proxy + add/delete + wishlist): 1. Prod DB migration: `cd api && DATABASE_URL="$(cat ~/prod-db-url.txt)" uv run alembic upgrade head` 2. Vercel → add `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` (Production scope,
      a Twitch application's credentials from dev.twitch.tv) → redeploy
- [ ] **Local dev**: add the same `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` to the
      gitignored `.env` so the add-game IGDB search works locally (503 until then)
- [ ] **Preview deploys can't authenticate — set the Supabase env vars for Preview scope.**
      Visiting a preview URL returned `500 MIDDLEWARE_INVOCATION_FAILED`, because
      `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` appear to be scoped to
      Production only. The middleware matches every non-asset path, so one missing var
      took down the whole deployment. Reproduced locally: `Your project's URL and Key are
    required to create a Supabase client!` **Quick fix:** Vercel → Settings →
      Environment Variables → tick **Preview** for both (same values; both are public by
      design — the browser needs them for the OAuth dance) → redeploy. `NEXT_PUBLIC_*` is
      inlined at build time, so an already-built deploy won't pick them up; it needs a new
      build.<br>
      **Caveat this accepts:** previews would then authenticate against _production_
      Supabase, so signing in on a preview uses your real account. Writes are still refused
      (`targetsForeignEnvironmentApi`), so it's reads + a real session. That's the spec's
      known no-staging trade-off (§7.5).<br>
      **Long-term fix: a real staging environment** — a second Supabase project (or
      Supabase branching) with its own auth + DB, so previews stop borrowing production's
      identity system entirely. Already tracked as a backlog item below; this is the
      concrete reason to promote it.<br>
      _Already mitigated in code (PR #68):_ the middleware and the two session-reading
      pages now degrade instead of throwing when the vars are absent — auth stops working
      but every page still renders, so a missing var can't take the site down again.

## Recently Completed

- [x] `npm run build` investigated — **not broken**. It is green on `main` (17/17 pages); it
      fails only when the library API is unreachable at build time, which is deliberate:
      `requireLibraryApiOrigin()` (`src/lib/libraryApi.ts`) documents that an unresolvable
      origin must fail loudly rather than prerender an empty library, and the error already
      says "Is the API running? Start it with `npm run dev:api`." Start the API before
      building locally
- [x] CI now runs the Python half of the toolchain (spec decision #8) — a second `api` job in
      `.github/workflows/ci.yml` runs `ruff check` + the full `pytest` suite against a
      postgres:16 service container. Previously 107 of 161 tests silently skipped in CI for
      want of a `DATABASE_URL`. Needed one new file, `api/scripts/ci_auth_schema.sql`: a
      minimal stand-in for Supabase's `auth.users`/`auth.identities`. GoTrue owns those
      tables everywhere else, so Alembic never creates them — but migration
      `f985740c0df9` adds a real FK to `auth.users`, so migrations can't run on bare
      Postgres without it

- [x] CRT metadata block is height-stable across channel changes (`components/crt/CrtTv.tsx`) — the auto-cycle used to resize the block per game, and since `.pcrt-stage--compact` is a bottom-aligned flex row, a taller block pushed the TV and the page below it down on a timer. Three causes, all fixed by reserving the worst case instead of truncating: the title now reserves and clamps two lines (`min-h-[2lh] line-clamp-2` — long names wrap into reserved space on mobile rather than growing the block), the system/genres line clamps to one, and the "playing since" line always renders (empty when a game has no open-session date) instead of disappearing
- [x] Mobile nav no longer cramped by the auth control (`components/Nav.tsx`, `components/AuthButton.tsx`) — type, gaps, and horizontal padding scale down below `sm` only, so desktop is unchanged. `AuthButton` shares the links' responsive scale so the row shrinks as one unit. Row height still comes from `--nav-height`, so `FilterBar`/`StatsPanel` sticky offsets are untouched
- [x] Game library page now uses the photorealistic CRT (`components/crt/CrtTv.tsx`, relocated out of `currently_playing/` since it's shared by two routes) instead of the wood-paneled TV; `/currently_playing` still works standalone. Old wood TV (`components/video_games/CurrentlyPlaying.tsx`) and its `crt-*` styles in `video_games.css` are left in place, unused
- [x] Dedicated `/currently_playing` route rendering a photorealistic '90s black-plastic CRT (hand-built CSS/SVG: molded cabinet, phosphor RGB mask, scanlines, roll bar, glare, speaker grille, dials, power LED) with the `▶ PLAY`/`CH 0N` OSD and channel-flicking; permanent "NO SIGNAL" snow when nothing is playing. Unlinked for now (URL-only). New component `components/currently_playing/CrtTv.tsx`; existing library TV untouched
- [x] Multiple currently-playing games on the CRT: channel-flicking — auto-cycle between in-progress games with a static/noise burst and `CH 0N` OSD, plus a clickable channel knob to advance manually and channel pips in the metadata (CurrentlyPlaying is now a client component)
- [x] Fix `.claude/tools/wikipedia.py` truncating nested templates (platforms/released_raw cut off mid-`{{collapsible list}}`) + add-game guidance for enhanced editions/ports (original NA date wins)

## Backlog / Ideas

- [ ] Make wishlist items fully editable, the same way library games are — today
      `EditWishlistModal.tsx` only supports delete + promote (the promote step is the only
      place name/system get touched), while `EditGameModal.tsx` can edit a game's fields.
      Want: edit a wishlist item's name, system, genres, release date, cover art in place,
      without having to promote it first. Needs a `WishlistItemUpdate` schema + `PATCH
/api/py/me/wishlist/{id}` on the API side (routers → services → repositories, mirroring
      the games write path), a Server Action in `video_games/actions.ts` with the usual
      `revalidateTag(libraryCacheTag(...))`, and the edit form fields lifted out of
      `EditGameModal` so both modals share one implementation instead of duplicating it.
- [ ] Field suggestions (system, genre, …) should work on mobile, not just desktop — the
      add/promote forms use a native `<datalist>` (`AddGameModal.tsx`, `EditWishlistModal.tsx`),
      which mobile Safari/Chrome either render poorly or ignore, so on a phone the system
      field is a bare free-text input. Replace the datalist with a real combobox (controlled
      input + filtered dropdown list, keyboard + touch friendly) so suggestions appear on
      every device. Also make the suggestions game-specific: `AddGameModal` already merges
      IGDB's `draft.platforms` for the selected game into the shelf-system list, but the
      promote form in `EditWishlistModal` only offers existing shelf systems — thread the
      IGDB platforms through there too, and consider doing the same for genres.

- [ ] Backfill existing games' genres to IGDB's vocabulary — the current genres came from the old Wikipedia-scraping `add-game` skill (retired in Phase 3), so they won't match what the new IGDB add flow (`/api/py/igdb/search`) suggests for future games. Normalizing now means future adds match up and skip the manual genre-editing step. Approach: for each library game with an `igdb_id` (or matched by name), pull its IGDB genres and overwrite the row's `genres`. Note: genre editing isn't in the write path yet (`GameUpdate`/`PATCH /me/games/{id}` is rating-only), so this needs either a one-off backfill script in `api/scripts/` (query IGDB per game, update `games.genres` directly) or extending the edit UI to support genres first. Decide whether to also map IGDB's verbose names (e.g. "Role-playing (RPG)") to shorter shelf labels while backfilling.<br>
      **Do the case/duplicate normalization in the same pass:** `clean_genres` (`api/app/schemas/me.py`) trims and drops blanks but does not dedupe or normalize case, so `"RPG, rpg"` stores both and `"RPG, RPG"` stores it twice — and the filter dropdown, built from `new Set(...)`, then shows them as separate options. Fix belongs in `clean_genres` (dedupe preserving first-seen casing) rather than the modal, so it also covers direct Server Action calls that bypass the UI. Same normalization problem as the backfill, one size larger, so the vocabulary decision above should settle the casing rule too.
- [ ] Enforce a per-user library size cap (~2k games) before multi-user signup opens (spec §9 decision #3 bundles row caps with the abuse guardrails; Phase 3 shipped the per-user rate limits but not this cap). Safe to defer while signup is closed and only the founder writes, but wire it into `create_my_game` (a cheap `count_games >= MAX_GAMES` check, MAX_GAMES as an env var like MAX_USERS) as part of Phase 4 so it isn't forgotten when writes open to others.
- [ ] Library-level "create session" button (owner-only) — start or log a session for any game without opening that game's pencil/edit modal: a game picker (search the library) + the same start-now / past-dates form the modal has. Stretch goal: accept a game NOT in the library yet ("I just started something new") — the flow would add the game to the library (IGDB search, Phase 3 slice 4's proxy) and open its session in one go. Backend already supports everything except add+start-in-one; UI is the work. Keep simple, iterate later.
- [ ] Normalize game metadata into a shared catalog (a `game_metadata` table + per-user `played_games`/`wishlist_games` link tables) — today `games` and `wishlist_items` each carry their own copy of name/system/genres/release_date/image_url. Spec §4.2 deliberately chose denormalized-with-`igdb_id` for v1 (canonical rows need an ownership/moderation story; user-entered games lack a canonical key). Revisit at Phase 4 when cross-user duplication actually exists — the `igdb_id` column on both tables is the planned backfill key (group by it, extract canonical rows, repoint).
- [ ] Profile pictures for user accounts (instanced game libraries follow-up, post-v1 — see `docs/plans/instanced-game-libraries.md`; likely Supabase Storage + upload/crop flow, shown in the library profile header and follower lists)
- [ ] Homepage customization per user (instanced game libraries follow-up, post-v1 — let users personalize their library page: hero/backdrop, shelf styling, featured games, etc. Scope TBD)
- [ ] Staging environment (instanced game libraries follow-up — the spec accepts a "no staging" caveat (§7.5: previews are read-only against prod, writes first run for real in prod); revisit with a second Supabase project or branching once the write path exists). **Promoted in priority 2026-07-28:** the preview 500 in "Up Next" is this caveat biting for real. Pointing Preview at production's Supabase is the stopgap, but it means preview sign-ins are production accounts. A second Supabase project (own DB + own GoTrue + own Google OAuth client) would give previews a real identity system and finally let the write path be exercised somewhere that isn't prod
- [ ] Decide the routing/namespace strategy as the site grows into multiple apps. Today auth is top-level (`/login`, `/onboarding`, `/auth/*`) because it's a site-wide identity system, while the game library lives under `/video_games`. Options once more apps exist: (a) keep everything on `rgrassian.com` with top-level auth + per-app route prefixes — simplest, one shared session across apps; (b) split an app onto a subdomain like `games.rgrassian.com` — cleaner isolation and independent deploys, but subdomains are separate cookie origins, so sharing the login session needs a `.rgrassian.com` cookie domain plus Supabase/Vercel redirect wiring, which works against cross-app SSO. Leaning toward (a) until an app genuinely needs isolation.
- [ ] "Current Hobbies" section on `/about` — start with currently-playing games (reusing the CRT/session data from the game library), with room to extend to books currently being read and other hobbies later. Design not decided yet (what it looks like, whether it reuses `CrtTv` directly or needs its own compact treatment).
- [ ] Alternate "currently playing" display: Marquee Banner (Option 2 from the mockups) — full-width banner using the game's blurred cover as the backdrop (same recipe as GameCaseBack: dominant color base + blurred art + dark overlay), sharp cover on the left, system/genre chips and "last played" on the right. Build it as a sibling of `CurrentlyPlaying` (same `Game` prop) and add a display-mode switch (config const, or URL param for fun) to swap between the CRT and the marquee. Mockups: https://claude.ai/code/artifact/2e891385-8fc9-4c9b-b8da-469658de243d
- [ ] Make an "improve" skill that runs a code review on recent changes, follows up on obviously actionable items, cleans up comments, and ensures code is clean / using best practices
- [ ] Fun interactive game/toy page for fun and for learning TypeScript — e.g. a DVD logo bouncing around with controls (size, speed, visuals) and a hit counter, or an bouncy ball game where you launch a ball (angry birds style) to bounce off platforms into a goal zones. The bouncy ball game could have cool "items" added to it (like portals, calls to other video games, etc)
- [ ] Start filling in last_played dates (ISO format YYYY-MM-DD) for recently played games; build a "recently played" feature on stats page
- [ ] test that my linting on prs is working
- [ ] Dark mode toggle
- [ ] A fun game to make could be a "shift" inspired game... i liked that one a lot
- [ ] Stats page: average rating per genere? Any other cool ones? Maybe average rating per X, ie ranked genres, ranked consoles, etc
- [ ] Game library "want to play"
- [ ] Movie library want to watch list, maybe a whole movie's seen section too...
- [ ] similar to the movie library idea, book library would be cool too. I wonder, if i had that many, maybe the route would just become "Library" and then i have my 3 sub libraries (games, movies, books) as sub routes of it. If I did, I would have to think how that library landing page would look like. would i: default to game library, have a page that has a card for all 3 (but then the user needs to make an extra click to start seeing, which i think is an issue), something else?
