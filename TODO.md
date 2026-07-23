# Project TODO

## Up Next

**Pending manual steps — game library backend (Vercel/prod dashboards, ~10 min total):**

- [ ] **Flip prod reads from CSV → Postgres** (outstanding since PR #61): Vercel →
      Settings → Environment Variables → add `LIBRARY_API_ORIGIN=https://rgrassian.com`
      (Production scope) → redeploy. Then click a rating in prod to confirm the
      optimistic UI converges, and note the first-write latency (stacked Node+Python
      cold start measurement).
- [ ] **After merging PR #63** (IGDB proxy + add/delete + wishlist): 1. Prod DB migration: `cd api && DATABASE_URL="$(cat ~/prod-db-url.txt)" uv run alembic upgrade head` 2. Vercel → add `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` (Production scope,
      a Twitch application's credentials from dev.twitch.tv) → redeploy
- [ ] **Local dev**: add the same `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` to the
      gitignored `.env` so the add-game IGDB search works locally (503 until then)

## Recently Completed

- [x] Game library page now uses the photorealistic CRT (`components/crt/CrtTv.tsx`, relocated out of `currently_playing/` since it's shared by two routes) instead of the wood-paneled TV; `/currently_playing` still works standalone. Old wood TV (`components/video_games/CurrentlyPlaying.tsx`) and its `crt-*` styles in `video_games.css` are left in place, unused
- [x] Dedicated `/currently_playing` route rendering a photorealistic '90s black-plastic CRT (hand-built CSS/SVG: molded cabinet, phosphor RGB mask, scanlines, roll bar, glare, speaker grille, dials, power LED) with the `▶ PLAY`/`CH 0N` OSD and channel-flicking; permanent "NO SIGNAL" snow when nothing is playing. Unlinked for now (URL-only). New component `components/currently_playing/CrtTv.tsx`; existing library TV untouched
- [x] Multiple currently-playing games on the CRT: channel-flicking — auto-cycle between in-progress games with a static/noise burst and `CH 0N` OSD, plus a clickable channel knob to advance manually and channel pips in the metadata (CurrentlyPlaying is now a client component)
- [x] Fix `.claude/tools/wikipedia.py` truncating nested templates (platforms/released_raw cut off mid-`{{collapsible list}}`) + add-game guidance for enhanced editions/ports (original NA date wins)

## Backlog / Ideas

- [ ] Backfill existing games' genres to IGDB's vocabulary — the current genres came from the old Wikipedia-scraping `add-game` skill (retired in Phase 3), so they won't match what the new IGDB add flow (`/api/py/igdb/search`) suggests for future games. Normalizing now means future adds match up and skip the manual genre-editing step. Approach: for each library game with an `igdb_id` (or matched by name), pull its IGDB genres and overwrite the row's `genres`. Note: genre editing isn't in the write path yet (`GameUpdate`/`PATCH /me/games/{id}` is rating-only), so this needs either a one-off backfill script in `api/scripts/` (query IGDB per game, update `games.genres` directly) or extending the edit UI to support genres first. Decide whether to also map IGDB's verbose names (e.g. "Role-playing (RPG)") to shorter shelf labels while backfilling.
- [ ] Library-level "create session" button (owner-only) — start or log a session for any game without opening that game's pencil/edit modal: a game picker (search the library) + the same start-now / past-dates form the modal has. Stretch goal: accept a game NOT in the library yet ("I just started something new") — the flow would add the game to the library (IGDB search, Phase 3 slice 4's proxy) and open its session in one go. Backend already supports everything except add+start-in-one; UI is the work. Keep simple, iterate later.
- [ ] Normalize game metadata into a shared catalog (a `game_metadata` table + per-user `played_games`/`wishlist_games` link tables) — today `games` and `wishlist_items` each carry their own copy of name/system/genres/release_date/image_url. Spec §4.2 deliberately chose denormalized-with-`igdb_id` for v1 (canonical rows need an ownership/moderation story; user-entered games lack a canonical key). Revisit at Phase 4 when cross-user duplication actually exists — the `igdb_id` column on both tables is the planned backfill key (group by it, extract canonical rows, repoint).
- [ ] Profile pictures for user accounts (instanced game libraries follow-up, post-v1 — see `docs/plans/instanced-game-libraries.md`; likely Supabase Storage + upload/crop flow, shown in the library profile header and follower lists)
- [ ] Homepage customization per user (instanced game libraries follow-up, post-v1 — let users personalize their library page: hero/backdrop, shelf styling, featured games, etc. Scope TBD)
- [ ] Staging environment (instanced game libraries follow-up — the spec accepts a "no staging" caveat (§7.5: previews are read-only against prod, writes first run for real in prod); revisit with a second Supabase project or branching once the write path exists)
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
