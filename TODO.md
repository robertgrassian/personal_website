# Project TODO

## Up Next

**Phase 4 is done and in production**, and Google's OAuth brand verification has passed, so
signup works for people who are not Robert. What's left is one browser pass and one bug.

- [ ] **Browser pass on the Phase 4 UI (PR #68)** — these are all client-rendered, so they
      are invisible to `curl` and were _not_ verified during implementation. Preview deploys
      can authenticate now, so use one — or run `npm run dev:full` locally and sign in with a
      magic link via Mailpit at `http://127.0.0.1:54324`: 1. **Sign-up CTA banner** (`/video-games`, signed out) — appearance, and that it
      disappears once signed in. Confirm the app name reads exactly
      "Video Game Library" on screen; it must match the Google Cloud console string
      or brand verification falls back to the `supabase.co` host. 2. **`AuthButton` in the library header** (`components/video_games/LibraryPage.tsx`) —
      it moved out of the global nav in slice 3. Check alignment against the `<h1>`
      (especially when a long display name wraps), contrast on the shelf background, and
      **both light and dark mode**. 3. **Login page `?error=` copy** (`/video-games/start`) — rendered client-side via
      `useSearchParams`, so it never appears in server HTML. Hit
      `/video-games/start?error=oauth_failed` and `?error=link_invalid` and confirm both
      messages render. 4. While you are there: the owner edit affordances on `/u/rgrassian` (pencils, Add
      game, Unrated shelf) should appear only on your own library and never on someone
      else's. 5. **IGDB search actually works in production** — open the add-game picker on
      `rgrassian.com` and search for a game. This is the only real confirmation that the
      Twitch creds took effect; a 503 here means the API process predates the env vars and
      needs a redeploy (see the `Settings` `lru_cache` gotcha in Recently Completed). 6. **The new landing page** (`/video-games/start`) in **dark mode** — the only part of PR #70 never checked in a browser. Its prose deliberately uses `text-foreground` rather than `text-subtle`, because `--subtle` measures 4.1:1 in dark mode (see the contrast item in the backlog), so this is confirming that call looks right and not just measures right.

- [ ] **Signed-in viewers see the sign-up CTA banner flash on `/video-games`.** Load the page
      with a session and refresh: the banner paints, then vanishes. It should never be visible
      to a signed-in viewer at all.<br>
      **Root cause (not a bug — a deliberate trade-off that turned out wrong).**
      `SignupCta.tsx` renders by default and hides itself in a `useEffect` once
      `onAuthStateChange` reports a session. That is the correct default for the
      _majority_ case (logged-out visitors get the banner with zero delay), but it means
      signed-in viewers necessarily see one frame of it — hydration cannot run before first
      paint. Flipping the default is **not** the fix: it just moves the flash onto the
      logged-out visitors this banner exists for, and they are the larger audience.<br>
      **The constraint any fix has to respect:** `/video-games` is statically cached and its
      HTML must stay byte-identical for every viewer (spec §7.2, decision #21). So "just read
      the cookie server-side and skip rendering it" is off the table — that makes the page
      dynamic and gives up the cache for a cosmetic win.<br>
      **Suggested direction: decide before first paint, not after hydration.** A small
      render-blocking inline `<script>` in the root layout can read `document.cookie`, look
      for the Supabase session cookie, and stamp a class (e.g. `data-authed`) on
      `<html>`; CSS then hides the banner with `html[data-authed] .signup-cta { display:none }`.
      The script runs before the browser paints, so there is no frame where the banner is
      visible, and the served HTML is still identical for everyone — only the script's
      _output_ differs per viewer. Same technique the no-flash dark-mode toggles use.
      Verified viable: `@supabase/ssr` sets its cookies with `httpOnly: false`
      (`node_modules/@supabase/ssr/dist/main/utils/constants.js`) and nothing in
      `src/lib/supabase/` overrides it, so the cookie is readable from JS.<br>
      _Two things to get right:_ the cookie name is `sb-<project-ref>-auth-token` and is
      **chunked** into `.0`, `.1`, … when the JWT is large, so match by prefix rather than
      exact name. And this is a presence check, not verification — fine here, because the
      decision is purely cosmetic and every real authorization check stays server-side. A
      forged cookie would hide a marketing banner from its own owner and nothing else.<br>
      _Same root cause, worth fixing in the same pass:_ `AuthButton` and the owner edit
      affordances behind `useIsLibraryOwner` resolve after hydration too, so they pop in the
      same way. If the pre-paint class works, it generalizes to all three.

## Recently Completed

_Newest first, capped at 20 — drop the oldest when adding past that._

- [x] **Google OAuth brand verification passed** (2026-07-28). Rejected on the first
      submission for two reasons, both fair: the home page did not explain the app's purpose,
      and its visible name disagreed with the console. `/video_games` was a shelf of cover art
      under the heading "Robert's Video Game Library" while the console said "Video Game
      Library" — Robert's personal library was doubling as the product's front door.<br>
      Fixed by building a real front door at `/video-games/start` (PR #70): `<h1>` is exactly
      the app name, purpose in prose, sign-in as a section rather than the whole page, privacy
      policy linked. The console's App homepage moved to that URL.<br>
      **Constraints worth keeping:** the app name must stay byte-identical to `APP_NAME` in
      `src/lib/appName.ts`, which both the landing page and the sign-up banner render. And
      `jbgmptlxoozfyzulhpbn.supabase.co` must stay in authorized domains — it covers the OAuth
      callback, so removing it risks breaking sign-in. `rgrassian.com` sits alongside it.<br>
      _Cosmetic thing this does not fix:_ the URL bar during the redirect still shows the
      supabase.co host. Only a Supabase custom auth domain changes that, which would mean
      redoing the redirect URIs and this domain list.
- [x] **Vercel → `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` set for Production**
      (2026-07-28). **Not confirmed end to end:** `/api/py/igdb/search` checks auth before it
      ever calls Twitch, so an unauthenticated probe returns 401 whether the creds are good or
      absent. Real confirmation is searching in the add-game picker on prod — item 5 of the
      browser pass in "Up Next"
- [x] **Vercel → Supabase env vars scoped to Preview** (2026-07-28), fixing preview deploys
      that returned `500 MIDDLEWARE_INVOCATION_FAILED`. `NEXT_PUBLIC_SUPABASE_URL` /
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` were Production-only, and the middleware matches every
      non-asset path, so one missing var took down the whole deployment (the throw:
      "Your project's URL and Key are required to create a Supabase client!"). Both vars are
      public by design — the browser needs them for the OAuth dance. `NEXT_PUBLIC_*` is
      inlined at build time, so this needed a fresh build, not just a redeploy.<br>
      **Caveat now live:** previews authenticate against _production_ Supabase, so signing in
      on a preview URL uses your real account. Writes are still refused
      (`targetsForeignEnvironmentApi`), so it's reads plus a real session — the spec's known
      no-staging trade-off (§7.5). The real fix is the staging-environment backlog item.<br>
      _Also mitigated in code (PR #68):_ the middleware and the two session-reading pages
      degrade instead of throwing when the vars are absent, so a missing var can no longer
      take the site down
- [x] **Local dev**: `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` added to the gitignored `.env`,
      verified returning real IGDB results (2026-07-28).<br>
      **Gotcha if search ever 503s again: restart the API.** `Settings` reads `.env` once at
      construction and is `lru_cache`d, so a uvicorn process started before a var was added
      never sees it. The 503 that surfaced here came from a server up for three days,
      predating the creds — and because it was started without `--reload`, it wasn't from
      `npm run dev:api`, so every later `npm run dev:full` had its API half die silently with
      `EADDRINUSE` while Next came up fine. Check with `lsof -nP -iTCP:8000 -sTCP:LISTEN` and
      `ps -o lstart= -p <pid>`
- [x] Prod DB confirmed at migration `8f881f29b261` (2026-07-28, via `alembic current`), so
      `rate_limits` and `igdb_tokens` exist in production. This was the merge blocker for
      PR #68: slice 6 charges every write against `rate_limits`, so an unmigrated prod would
      have 500'd every add/rating/session/wishlist edit rather than only failing game search
- [x] **Instanced libraries Phase 4 — multi-user** (PR #68, branch `phase4/multi-user`,
      2026-07-28). Seven slices: CI running ruff + the full pytest suite against a real
      Postgres; `/u/[username]` public libraries with the username threaded through the
      three places it was hardcoded; the `/library` resolver and post-login redirects;
      auth surfaces moved under the game library; the sign-up CTA banner; profile header
      and real empty states; per-user write limits and a `MAX_GAMES` cap. 173 tests.
      Remaining manual steps are in "Up Next" above
- [x] Prod CSV → Postgres cutover confirmed serving: `https://rgrassian.com/video-games`
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
- [x] Game library page now uses the photorealistic CRT (`components/crt/CrtTv.tsx`, relocated out of `currently-playing/` since it's shared by two routes) instead of the wood-paneled TV; `/currently-playing` still works standalone. Old wood TV (`components/video_games/CurrentlyPlaying.tsx`) and its `crt-*` styles in `video-games.css` are left in place, unused
- [x] Dedicated `/currently-playing` route rendering a photorealistic '90s black-plastic CRT (hand-built CSS/SVG: molded cabinet, phosphor RGB mask, scanlines, roll bar, glare, speaker grille, dials, power LED) with the `▶ PLAY`/`CH 0N` OSD and channel-flicking; permanent "NO SIGNAL" snow when nothing is playing. Unlinked for now (URL-only). New component `components/currently-playing/CrtTv.tsx`; existing library TV untouched
- [x] Multiple currently-playing games on the CRT: channel-flicking — auto-cycle between in-progress games with a static/noise burst and `CH 0N` OSD, plus a clickable channel knob to advance manually and channel pips in the metadata (CurrentlyPlaying is now a client component)
- [x] Fix `.claude/tools/wikipedia.py` truncating nested templates (platforms/released_raw cut off mid-`{{collapsible list}}`) + add-game guidance for enhanced editions/ports (original NA date wins)

## Backlog / Ideas

- [ ] **Nest the whole game library under `/video-games`.** A user's library is at
      `/u/rgrassian`; it should be `/video-games/u/rgrassian`, so the app owns one prefix
      instead of leaking a top-level `/u` namespace. This is the concrete first instance of the
      routing/namespace decision already in this backlog ("Decide the routing/namespace strategy
      as the site grows into multiple apps") and effectively settles it in favour of option (a),
      per-app route prefixes on one domain.<br>
      **Do it soon.** `/u/` shipped days ago (Phase 4) and no one but Robert has a library yet,
      so almost nothing links to those URLs. Every week of signups makes the rename more
      expensive, since a user's public library page is the thing people share.<br>
      _Google is unaffected:_ the App homepage is `/video-games/start`, which does not move. No
      resubmission needed. Worth double-checking the console afterwards anyway.<br>
      _The work:_ move `src/app/u/[username]/` under `src/app/video-games/`; add a permanent
      redirect `/u/:username` → `/video-games/u/:username` next to the kebab-case ones in
      `next.config.ts`; update the five places that build the URL (`video-games/start/page.tsx`,
      `library/page.tsx`, `onboarding/page.tsx`, `onboarding/actions.ts`, and the `activePaths`
      array in `Nav.tsx`); add it to `sitemap.ts`.<br>
      _Two API details:_ `RESERVED_USERNAMES` (`api/app/services/me.py`) can stop reserving `u`
      once nothing lives at the top level, though keeping it costs nothing. More usefully, that
      set still lists `video_games` with an underscore, which is stale after the kebab rename —
      and since `USERNAME_RE` allows hyphens, `video-games` is a claimable username today that
      would be confusing next to the route. Fix that in the same pass.<br>
      _The one cost:_ `/u/rgrassian` is shorter and reads better when shared than
      `/video-games/u/rgrassian`. If that matters more than the namespacing, the alternative is
      keeping `/u/` as the canonical public URL and accepting the inconsistency.
- [ ] **Put the CRT on the landing page (`/video-games/start`), cycling through games.** Same
      channel-flicking treatment `CrtTv` already does on a user's library: it takes
      `games: Game[]` and a `compact?: boolean`, auto-cycles with a static burst, and already
      respects `prefers-reduced-motion` by not auto-cycling. Needs `@/components/crt/crt.css`
      imported wherever it renders, the way `LibraryPage` does.<br>
      **Where the games come from, cheapest first.** A hardcoded array is easiest and safest:
      cover art can point at `images.igdb.com`, already allowed in `next.config.ts`
      `remotePatterns`. Better and barely harder is reading five real games from the existing
      public endpoint the site already uses (`getGames(LIBRARY_OWNER_USERNAME)`), which keeps
      the page honest, needs no new dependency, and follows the prerender-and-cache pattern
      `/video-games` already uses.<br>
      _Think twice about the Steam idea._ This page is Google's OAuth App homepage. A live call
      to a third-party API introduces a failure mode on the one URL that must always render and
      describe the app, and adds an external dependency to a page that is currently static.
      If it is wanted for its own sake, treat it as a separate feature with a cached fallback
      rather than as the CRT's data source.<br>
      _Watch the layout:_ the page's job is to state the name and purpose above the fold for a
      reviewer reading top down. A TV pushing the copy down would undo what PR #70 fixed, so
      the CRT probably belongs below the sign-in section, not above it.
- [ ] **Implement account deletion (`DELETE /api/py/me/account`)** — spec decision #22 planned
      it (cascade down from `profiles` + `auth.users` removal via the Supabase Admin API,
      which `core/supabase_admin.py` already wraps for the over-cap cleanup), but it was never
      built. Noticed 2026-07-28 while editing `/privacy`: the policy described deleting your
      account as though it were self-serve, so the copy now points at email instead, which is
      the only mechanism that actually exists. Once the endpoint and a UI control ship,
      update that paragraph (there is a comment in `src/app/privacy/page.tsx` marking it).
      Worth doing before signup opens widely: it is the kind of thing a privacy policy is
      expected to back up. Note `rate_limits` has no FK to `profiles`, so those rows will not
      cascade and need deleting explicitly.

- [ ] **If a username-rename feature is ever built, delete or invalidate the `usernameByUserId`
      memo** in `src/lib/meApi.ts` (`fetchMyUsername`). It caches user id → username in module
      scope to keep the write path from spending an API round trip per mutation just to learn
      which cache tag to purge, and it is only safe because usernames are assigned once at
      onboarding with no way to change them. A rename would leave it revalidating the old tag,
      so the renamed library's pages would go stale instead. Added 2026-07-28 during the PR #68
      review.

- [ ] Make wishlist items fully editable, the same way library games are — today
      `EditWishlistModal.tsx` only supports delete + promote (the promote step is the only
      place name/system get touched), while `EditGameModal.tsx` can edit a game's fields.
      Want: edit a wishlist item's name, system, genres, release date, cover art in place,
      without having to promote it first. Needs a `WishlistItemUpdate` schema plus a
      `PATCH /api/py/me/wishlist/{id}` endpoint (routers → services → repositories, mirroring
      the games write path), a Server Action in `video-games/actions.ts` with the usual
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
- [ ] **`--subtle` fails WCAG AA for body text in both color schemes.** Measured 2026-07-28
      while fixing the landing page: dark mode is `#6b7280` on `#0a0a0a` = **4.1:1**, light mode
      is `#9ca3af` on `#ffffff` = **2.5:1**. The AA minimum for normal-size text is 4.5:1, so
      the light value is the worse of the two by a wide margin. Fine for genuinely decorative
      text; not fine for the prose it currently carries in several places.<br>
      The landing page was fixed by moving its copy to `text-foreground`, which is a workaround
      rather than a fix: the token is still wrong everywhere else it holds real sentences.
      Proper fix is darkening the light value and lightening the dark one, then walking the
      pages that use it (`about`, `resume`, the shelf UI, `StatsPanel`, `SqlQueryPanel`) to
      confirm nothing that was meant to recede now shouts. Worth doing as its own pass with
      before/after screenshots, since it touches the look of the whole site.<br>
      _Note the dark value is currently darker than the light one_ (gray-500 vs gray-400),
      which is backwards: muted text on a dark background needs to be lighter, not darker.
      That inversion is probably the original mistake.
- [ ] **A username rename feature must delete `usernameByUserId` (`src/lib/meApi.ts`).** That
      module-scope map memoizes user id → username so the ten write paths don't each pay an
      API round trip to learn whose cache tag to purge. It is correct only because usernames
      are assigned once at onboarding and there is no rename endpoint. Add renaming without
      touching it and a stale entry revalidates the _old_ username's tag — the renamed
      library then serves stale pages indefinitely, with no error anywhere to explain why.
      There is a shouty comment on the map itself; this is the second place to trip over it.<br>
      _Second constraint on the same map:_ it is keyed on the user id from `getSession()`,
      which does not verify the JWT, so it is only sound because every caller sits behind a
      write FastAPI already accepted. If `revalidateMyLibrary()` ever gets called somewhere
      that isn't gated on a successful write, a forged cookie chooses which user's cache tag
      gets purged. Both constraints disappear if the memo does — dropping it costs one extra
      round trip per write and nothing else.
- [ ] **Show the "Unrated" shelf to everyone, not just the owner.** `GameLibrary.tsx:332`
      gates it on `canEdit`, so visitors to `/u/{username}` never see games you have played
      but not rated. It was built as an owner utility (every unrated game keeps a case and a
      pencil, so clearing a rating stays reversible from the UI) and that framing is what
      needs to change: an unrated game is still part of the library.<br>
      _Cheap part:_ the data is already there. `LibraryPage` passes `unratedGames` to every
      viewer and only the client-side `canEdit` check hides the shelf, so the cached HTML
      doesn't change and nothing about the caching design is affected. Drop `canEdit` from
      that condition, and keep passing `onEditGame` **only** when `canEdit` so visitors get
      cases without pencils.<br>
      _Three things that stop being invisible once visitors can see it:_
      **(1)** The shelf sits deliberately outside the filter/group/sort pipeline
      (`GameLibrary.tsx:328-334`), so it ignores search, system and genre filters. Tolerable
      for a private utility strip; confusing in public browsing, where filtering to "SNES"
      would still leave unrelated unrated games on screen. Decide whether it joins the
      pipeline as a real group or stays appended.
      **(2)** The headline count disagrees. `playedCount` (`LibraryPage.tsx:62`) is rated
      games plus currently-playing, so an unrated game you're not playing is on a visible
      shelf but not in "N games". Either widen the count or accept and document the gap.
      **(3)** Unrated in-progress games would appear both on the CRT and on this shelf. That
      double-billing already happens for the owner, so it may be fine — just decide on
      purpose rather than by accident.
- [ ] **Restrict the add-game "system" suggestions to the platforms the game actually released
      on.** Today `AddGameModal.tsx:156` builds the `<datalist>` as a _union_ —
      `[...new Set([...existingSystems, ...(draft?.platforms ?? [])])]` — with every shelf
      system you already own listed **first**, so the picked game's real IGDB platforms are
      buried at the bottom of a long list. Want: once a game is picked from IGDB, the
      suggestions are just that game's platforms, so you can't accidentally file Chrono
      Trigger under Xbox.<br>
      _Keep the fallback:_ when there is no IGDB pick (manual entry — `draft.platforms` is
      empty) the list must fall back to `existingSystems`, or the field offers nothing at all.<br>
      _The wrinkle that makes this more than a one-line change:_ IGDB platform names are
      verbose and won't match your shelf labels (IGDB says "Nintendo Entertainment System",
      the shelf says "NES"). Restricting to IGDB names alone would start writing a second
      spelling of a system you already have, and since the library groups shelves by exact
      system string, that silently splits one shelf into two. So this needs a normalization
      step: map IGDB platform names onto existing shelf systems where one matches, and only
      offer the raw IGDB name when it's genuinely a system you don't own yet. Worth deciding
      the mapping alongside the genre-vocabulary normalization below, since it's the same
      problem one column over.<br>
      Same change applies to the promote form in `EditWishlistModal.tsx`, which today offers
      only existing shelf systems and no IGDB platforms at all (see the item above).

- [ ] Backfill existing games' genres to IGDB's vocabulary — the current genres came from the old Wikipedia-scraping `add-game` skill (retired in Phase 3), so they won't match what the new IGDB add flow (`/api/py/igdb/search`) suggests for future games. Normalizing now means future adds match up and skip the manual genre-editing step. Approach: for each library game with an `igdb_id` (or matched by name), pull its IGDB genres and overwrite the row's `genres`. Note: genre editing isn't in the write path yet (`GameUpdate`/`PATCH /me/games/{id}` is rating-only), so this needs either a one-off backfill script in `api/scripts/` (query IGDB per game, update `games.genres` directly) or extending the edit UI to support genres first. Decide whether to also map IGDB's verbose names (e.g. "Role-playing (RPG)") to shorter shelf labels while backfilling.<br>
      **Do the case/duplicate normalization in the same pass:** `clean_genres` (`api/app/schemas/me.py`) trims and drops blanks but does not dedupe or normalize case, so `"RPG, rpg"` stores both and `"RPG, RPG"` stores it twice — and the filter dropdown, built from `new Set(...)`, then shows them as separate options. Fix belongs in `clean_genres` (dedupe preserving first-seen casing) rather than the modal, so it also covers direct Server Action calls that bypass the UI. Same normalization problem as the backfill, one size larger, so the vocabulary decision above should settle the casing rule too.
- [ ] Enforce a per-user library size cap (~2k games) before multi-user signup opens (spec §9 decision #3 bundles row caps with the abuse guardrails; Phase 3 shipped the per-user rate limits but not this cap). Safe to defer while signup is closed and only the founder writes, but wire it into `create_my_game` (a cheap `count_games >= MAX_GAMES` check, MAX_GAMES as an env var like MAX_USERS) as part of Phase 4 so it isn't forgotten when writes open to others.
- [ ] Library-level "create session" button (owner-only) — start or log a session for any game without opening that game's pencil/edit modal: a game picker (search the library) + the same start-now / past-dates form the modal has. Stretch goal: accept a game NOT in the library yet ("I just started something new") — the flow would add the game to the library (IGDB search, Phase 3 slice 4's proxy) and open its session in one go. Backend already supports everything except add+start-in-one; UI is the work. Keep simple, iterate later.
- [ ] Normalize game metadata into a shared catalog (a `game_metadata` table + per-user `played_games`/`wishlist_games` link tables) — today `games` and `wishlist_items` each carry their own copy of name/system/genres/release_date/image_url. Spec §4.2 deliberately chose denormalized-with-`igdb_id` for v1 (canonical rows need an ownership/moderation story; user-entered games lack a canonical key). Revisit at Phase 4 when cross-user duplication actually exists — the `igdb_id` column on both tables is the planned backfill key (group by it, extract canonical rows, repoint).
- [ ] Profile pictures for user accounts (instanced game libraries follow-up, post-v1 — see `docs/plans/instanced-game-libraries.md`; likely Supabase Storage + upload/crop flow, shown in the library profile header and follower lists)
- [ ] Homepage customization per user (instanced game libraries follow-up, post-v1 — let users personalize their library page: hero/backdrop, shelf styling, featured games, etc. Scope TBD)
- [ ] Staging environment (instanced game libraries follow-up — the spec accepts a "no staging" caveat (§7.5: previews are read-only against prod, writes first run for real in prod); revisit with a second Supabase project or branching once the write path exists). **Promoted in priority 2026-07-28:** the preview 500 in "Up Next" is this caveat biting for real. Pointing Preview at production's Supabase is the stopgap, but it means preview sign-ins are production accounts. A second Supabase project (own DB + own GoTrue + own Google OAuth client) would give previews a real identity system and finally let the write path be exercised somewhere that isn't prod
- [ ] Decide the routing/namespace strategy as the site grows into multiple apps. Today auth is top-level (`/login`, `/onboarding`, `/auth/*`) because it's a site-wide identity system, while the game library lives under `/video-games`. Options once more apps exist: (a) keep everything on `rgrassian.com` with top-level auth + per-app route prefixes — simplest, one shared session across apps; (b) split an app onto a subdomain like `games.rgrassian.com` — cleaner isolation and independent deploys, but subdomains are separate cookie origins, so sharing the login session needs a `.rgrassian.com` cookie domain plus Supabase/Vercel redirect wiring, which works against cross-app SSO. Leaning toward (a) until an app genuinely needs isolation.
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
