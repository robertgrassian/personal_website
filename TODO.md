# Project TODO

## Up Next

**Pending manual steps (dashboards / prod DB).** Ordered — the first one gates merging PR #68.

- [ ] **⚠️ BEFORE merging PR #68: confirm prod is migrated to `8f881f29b261`.**
      `cd api && DATABASE_URL="$(cat ~/prod-db-url.txt)" uv run alembic current` — if it is
      not at head, run `alembic upgrade head`. This was already listed as a post-#63 step and
      may not have been done. It is now **blocking**, not optional: Phase 4 slice 6 charges
      every write against the `rate_limits` table that migration creates, so on an unmigrated
      prod database every add, rating, session, and wishlist edit would 500 instead of just
      game search failing. Slice 6 itself adds no migration (`alembic check` is clean); it
      only raises the stakes on that one.
- [ ] **Vercel → add `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET`** (Production scope, from a
      Twitch application at dev.twitch.tv) → redeploy. Until then `/api/py/igdb/search`
      answers 503 and the add-game picker cannot search.
- [ ] **Local dev**: add the same `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` to the
      gitignored `.env` so the add-game IGDB search works locally (503 until then)
- [ ] **Google OAuth brand verification** (only after PR #68 is in production, since it needs
      the live CTA banner). Google Cloud console → OAuth consent screen → Branding:
      App name → `Robert's Game Library` (must match `APP_NAME` in
      `src/components/video_games/SignupCta.tsx` **byte for byte**);
      App homepage → `https://rgrassian.com/video_games`;
      Privacy policy → `https://rgrassian.com/privacy`;
      add `rgrassian.com` as an authorized domain; resubmit.
      Done = the consent screen shows the app name instead of the `supabase.co` host.
      _Contingency:_ if Google also demands a Terms of Service URL, add `/terms` mirroring
      the existing `/privacy` page.
- [ ] **Preview deploys can't authenticate — set the Supabase env vars for Preview scope.**
      Visiting a preview URL returned `500 MIDDLEWARE_INVOCATION_FAILED`, because
      `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` appear to be scoped to
      Production only. The middleware matches every non-asset path, so one missing var
      took down the whole deployment. Reproduced locally — the throw is
      "Your project's URL and Key are required to create a Supabase client!".<br>
      **Quick fix:** Vercel → Settings →
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
- [ ] **Browser pass on the Phase 4 UI (PR #68)** — these are all client-rendered, so they
      are invisible to `curl` and were _not_ verified during implementation. Do this after
      the Preview env vars above are set (or just run `npm run dev:full` locally and sign in
      with a magic link via Mailpit at `http://127.0.0.1:54324`): 1. **Sign-up CTA banner** (`/video_games`, signed out) — appearance, and that it
      disappears once signed in. Confirm the app name reads exactly
      "Robert's Game Library" on screen; it must match the Google Cloud console string
      or brand verification falls back to the `supabase.co` host. 2. **`AuthButton` in the library header** (`components/video_games/LibraryPage.tsx`) —
      it moved out of the global nav in slice 3. Check alignment against the `<h1>`
      (especially when a long display name wraps), contrast on the shelf background, and
      **both light and dark mode**. 3. **Login page `?error=` copy** (`/video_games/login`) — rendered client-side via
      `useSearchParams`, so it never appears in server HTML. Hit
      `/video_games/login?error=oauth_failed` and `?error=link_invalid` and confirm both
      messages render. 4. While you are there: the owner edit affordances on `/u/rgrassian` (pencils, Add
      game, Unrated shelf) should appear only on your own library and never on someone
      else's.

## Recently Completed

- [x] **Instanced libraries Phase 4 — multi-user** (PR #68, branch `phase4/multi-user`,
      2026-07-28). Seven slices: CI running ruff + the full pytest suite against a real
      Postgres; `/u/[username]` public libraries with the username threaded through the
      three places it was hardcoded; the `/library` resolver and post-login redirects;
      auth surfaces moved under the game library; the sign-up CTA banner; profile header
      and real empty states; per-user write limits and a `MAX_GAMES` cap. 173 tests.
      Remaining manual steps are in "Up Next" above
- [x] Prod CSV → Postgres cutover confirmed serving: `https://rgrassian.com/video_games`
      returns 200 and `/api/py/health` reports `{"status":"ok","env":"prod","db":"ok"}`.
      (The optimistic-UI click-through and the first-write cold-start timing were not
      measured — do those next time you edit something in prod)

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
      without having to promote it first. Needs a `WishlistItemUpdate` schema plus a
      `PATCH /api/py/me/wishlist/{id}` endpoint (routers → services → repositories, mirroring
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
