# Project TODO

## Up Next

**Phase 5 (social graph) is built and merged**: follow/unfollow endpoints, auto-follow at signup,
Following/Followers tabs, a follow button, and "Back to my library". User search was deliberately
held back and is in Backlog / Ideas. Nothing needs configuring to ship it: the founder is a
code constant, not an env var, and the planned backfill turned out to be unnecessary. All that
is left is a browser pass — the same shape as Phase 4, where the client-rendered surfaces were
the ones no test covered.

- [ ] **Browser pass on the Phase 5 UI.** Everything per-viewer resolves after hydration, so
      `curl` proves almost nothing about it — the same reason Phase 4 needed its own pass. Check:
      the Follow button toggles and survives a reload; it is absent on your own library and when
      signed out; "Back to my library" appears only for a signed-in non-owner; the
      Following/Followers tabs list users and their links work; `?view=followers` deep-links;
      and both counts in the header agree with the lists on **both** users' pages after a follow
      (that last one is the two-tag revalidation, the most likely thing to be subtly wrong).<br>
      _One case worth trying deliberately_ because it is the bug this design is most prone to:
      from a follower list, click straight through to another user's library and confirm the
      button shows _their_ follow state, not the previous page's. Those pages reconcile rather
      than remount, so a stale answer would offer to unfollow the wrong person.
- [ ] **The "Unrated" shelf has a big gap above it.** Confirmed cause: the grouped shelves
      render inside `<div className="mt-6 pb-24">` (`GameLibrary.tsx:316`) and the Unrated
      shelf sits _outside_ that wrapper (`GameLibrary.tsx:332`), so the wrapper's 6rem bottom
      padding lands between the last shelf and Unrated. Want it spaced like every other shelf.
      The `pb-24` is there to keep the last shelf clear of the viewport bottom, so the fix is
      to move that padding to whichever element is genuinely last (or wrap both shelf groups
      in one padded container) rather than just deleting it. Overlaps with the backlog item
      about showing Unrated to visitors: if that one lands and Unrated joins the normal
      group pipeline, this gap disappears on its own.

## Backlog / Ideas

- [ ] **Collapse the two per-viewer API calls on a library page into one.** Loading any library
      fires two independent authenticated requests that overlap: `useIsLibraryOwner`
      (`src/components/video_games/useIsLibraryOwner.ts`) fetches `/api/py/me/profile` to answer
      "is this mine?", and `useViewerRelationship`
      (`src/components/video_games/useViewerRelationship.ts`) fetches
      `/api/py/me/relationship/{username}` to answer "am I following them?". Each also calls
      `supabase.auth.getSession()` separately.<br>
      _The overlap is exact:_ `RelationshipRead` already returns `isMe`
      (`api/app/schemas/me.py`), which is precisely what `useIsLibraryOwner` computes by
      comparing usernames. So the relationship response can answer both questions and the
      profile fetch can go — no API change needed.<br>
      _What makes it more than deleting a hook:_ the two live in different component trees.
      `useIsLibraryOwner` is called inside `GameLibrary`, while `useViewerRelationship` sits in
      `FollowStateProvider` around the header, so sharing one answer means either lifting the
      provider to wrap both or moving the owner check into that context — and `GameLibrary`'s
      `canEdit` threads into pencils, the Unrated shelf and the empty states, so the blast radius
      is wider than the fetch itself. Cross-reference the pop-in item below: whoever fixes that
      is in the same code and should do both at once.
- [ ] **User search, so you can find people to follow without knowing their username.** Held back
      from Phase 5 (2026-07-30) to keep that MVP small; the follow graph itself shipped, and with
      auto-follow seeding both lists, browsing Following/Followers is a working discovery path, so
      this is an enhancement rather than a prerequisite. Still the thing that makes
      `/video-games/start`'s pitch about browsing other people's libraries true for a stranger.<br>
      _Almost no schema work left:_ `pg_trgm` and **both** GIN indexes on `profiles`
      (`ix_profiles_username_trgm`, `ix_profiles_display_name_trgm`) shipped in the baseline
      migration, and `"search"` is already in `RESERVED_USERNAMES`, so `/users/search` cannot
      collide with `/users/{username}`. What is missing is the endpoint, a `UserSummary[]`
      response (the schema already exists, `api/app/schemas/users.py`), and a debounced search
      input.<br>
      _Two decisions to make:_ give it its own rate-limit bucket rather than the shared `writes`
      one, following `igdb_search` (`api/app/services/igdb.py`) — it is a read, and an unbudgeted
      fuzzy search is the cheapest way to make Postgres work hard. And decide whether results
      rank by trigram similarity or just filter, since with `MAX_USERS` at 100 the naive version
      is indistinguishable and the index is doing nothing yet either way.
- [ ] **Give library games a "notes" field, like wishlist entries already have, then grow it
      into a real play journal.** Today notes exist only on the wishlist side:
      `wishlist_items.notes` (`api/app/models/wishlist_item.py:41`, `max_length=1000` in
      `api/app/schemas/me.py:144`) with a 2-row textarea plus a "Save notes" button in
      `EditWishlistModal.tsx:141-161`. The `games` table has no notes column at all.<br>
      _The want:_ "when I play a game I usually keep an md file to track progress and write
      notes; I want to do that from the site instead of another app." So the quick-entry
      textarea stays for one-liners, and both modals also get a larger popup view for writing
      and reading properly. Wishlist behaves the same, for simplicity.<br>
      _What makes it more than a column add:_ 1000 chars is a note, not a journal, so the cap
      needs revisiting (and with it the per-user size story that `max_games` covers for rows).
      A save-button-per-keystroke textarea is already the compromise on the wishlist side; a
      full-screen editor wants explicit save/dirty handling and probably autosave. Decide
      early whether this is one free-text blob or timestamped entries — the second is much
      closer to what an md file actually is, and retrofitting it later means a migration.
      Related: the session model already knows when you played, so dated entries could hang
      off `play_sessions` rather than the game row.
- [ ] **Overhaul the wishlist promote flow: it is "played", not "bought".** Today
      `EditWishlistModal.tsx:171` offers "I bought it, move to library" and the promote step
      just asks for a system (`WishlistPromote`), landing the game on the Unrated shelf.
      Two premises are wrong: moving to the library means you _played_ it (which might be a
      current session or a past one), and a wishlist entry may be a game already in the
      library that you want to replay.<br>
      _Want:_ rename the button to "Played, move to the library" and show it **only** when the
      game is not already in the library. Either way, follow up with "Track a play session?".
      When the game is already in the library and the move button is hidden, offer "Track a
      play session?" straight away.<br>
      _The wiring:_ the modal only receives `item` and `existingSystems`
      (`EditWishlistModal.tsx:14-19`), so "is this already in the library?" needs the library
      names threaded in from `GameLibrary` (which has `games` in hand) — and matching by name
      alone will misfire across systems, so decide whether `igdb_id` is the key. Starting a
      session from here means reaching the same `logSession` path `EditGameModal` uses.
- [ ] **Make library and wishlist entries fully editable, and keep the two edit modals 1:1.**
      Both sides are stuck today: `GameUpdate` (`api/app/schemas/me.py:82-96`) is
      **rating-only** by design ("future metadata edits extend this model"), so
      `EditGameModal` cannot touch name, system, genres, release date or cover art either —
      the earlier framing that only the wishlist was limited was wrong. `EditWishlistModal`
      supports starred/notes/system plus promote and delete
      (`PATCH /api/py/me/wishlist/{id}`), and the promote step is still the only place a
      wishlist item's system gets set.<br>
      _Want:_ edit essentially every field from either modal, with the same form in both.
      Keep only the genuinely mode-specific bits apart: rating on the library side, starred on
      the wishlist side.<br>
      _Work:_ extend `GameUpdate` past rating and add the matching service/repository handling
      (routers → services → repositories), extend `WishlistUpdate` past starred/notes/system,
      then lift the shared field set out of `EditGameModal` into one component both modals
      render, with Server Actions in `video-games/actions.ts` doing the usual
      `revalidateTag(libraryCacheTag(...))`. Cover art edits must keep
      `validate_igdb_image_url` (`GameCreate` restricts `imageUrl` to IGDB CDN URLs so nobody
      uses their library as free image hosting) — an "edit image" field that accepts arbitrary
      URLs would reopen exactly that. Genre editing here also unblocks the genre-vocabulary
      backlog item below, which currently needs a one-off script for want of a write path.
- [ ] **Fold "+ Add to wishlist" into a single "+ Add game" that picks its destination.**
      `GameLibrary.tsx:211` swaps the button label by view, and `AddGameModal` already takes a
      `target: "library" | "wishlist"` prop (`AddGameModal.tsx:26`) that swaps the rating
      picker for a star checkbox and makes the system optional. So the modal can already do
      both: what is missing is a destination switcher (two tabs) inside it, defaulted to
      whichever view the button was clicked from.<br>
      _Watch:_ `target` currently changes required fields, so the switcher has to re-validate
      rather than just re-label — flipping from wishlist to library with an empty system must
      block submit, not silently post.
- [ ] **Make the view tabs and the add button sticky, like the filter bar.** The
      "Played" / "Want to Play" strip and the "+ Add game" / "Stats" row
      (`GameLibrary.tsx:184-226`) scroll away, while `FilterBar` sticks at
      `top-[var(--nav-height)]` (`FilterBar.tsx:263`).<br>
      _Not just adding `sticky`:_ the filter bar's offset is `--nav-height` exactly, so a
      sticky tab strip above it either overlaps or has to be part of the same sticky block,
      with the filter bar's `top` becoming nav height plus strip height. `FilterBar` also
      snapshots its document-relative top once in a `useLayoutEffect`
      (`FilterBar.tsx:161-168`) to drive the mobile hide-on-scroll-down behavior, and that
      measurement assumes nothing sticky sits above it. Simplest shape is probably one sticky
      container holding both, so they hide and show as a unit on mobile.
- [ ] **Owner edit affordances still pop in after hydration.** The pencils, "Add game" and the
      Unrated shelf appear a beat after first paint on your own library, because
      `useIsLibraryOwner` (`src/components/video_games/useIsLibraryOwner.ts`) resolves in a
      `useEffect`. The pre-paint `data-authed` flag that fixed the CTA banner and `AuthButton`
      (2026-07-29, see Recently Completed) **cannot** be extended to cover this: the cookie proves
      a session exists but not whose it is, and the JWT's `sub` claim is a user id, not a
      username, so answering "is this viewer the owner of THIS library?" needs the
      `/me/profile` round trip either way.<br>
      _Options, none free:_ have the API return the username in a separate readable cookie at
      sign-in (cheap, but adds a second source of truth for identity that can go stale after a
      rename); or accept the pop-in and make it less jarring by reserving space so nothing
      shifts. Lower priority than the two already fixed: this one only affects a viewer looking
      at their own library, who is about to interact with the page anyway.
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
      _The map's other constraint_ (unverified `getSession()` user id, so it is only sound
      behind a write FastAPI already accepted) is documented on the map and on
      `revalidateMyLibrary()` in `src/app/video-games/actions.ts` as of PR #69, so it does not
      need restating here. Both constraints disappear if the memo does — dropping it costs one
      extra round trip per write and nothing else.
- [ ] **Show the "Unrated" shelf to everyone, not just the owner.** `GameLibrary.tsx:332`
      gates it on `canEdit`, so visitors to `/video-games/u/{username}` never see games you have played
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
      only existing shelf systems and no IGDB platforms at all (see the mobile field-suggestions
      item below, which covers the same form).
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
- [ ] Library-level "create session" button (owner-only) — start or log a session for any game without opening that game's pencil/edit modal: a game picker (search the library) + the same start-now / past-dates form the modal has. Stretch goal: accept a game NOT in the library yet ("I just started something new") — the flow would add the game to the library (IGDB search, Phase 3 slice 4's proxy) and open its session in one go. Backend already supports everything except add+start-in-one; UI is the work. Keep simple, iterate later.
- [ ] Normalize game metadata into a shared catalog (a `game_metadata` table + per-user `played_games`/`wishlist_games` link tables) — today `games` and `wishlist_items` each carry their own copy of name/system/genres/release_date/image_url. Spec §4.2 deliberately chose denormalized-with-`igdb_id` for v1 (canonical rows need an ownership/moderation story; user-entered games lack a canonical key). Revisit at Phase 4 when cross-user duplication actually exists — the `igdb_id` column on both tables is the planned backfill key (group by it, extract canonical rows, repoint).
- [ ] Profile pictures for user accounts (instanced game libraries follow-up, post-v1 — see `docs/plans/instanced-game-libraries.md`; likely Supabase Storage + upload/crop flow, shown in the library profile header and follower lists)
- [ ] Homepage customization per user (instanced game libraries follow-up, post-v1 — let users personalize their library page: hero/backdrop, shelf styling, featured games, etc. Scope TBD)
- [ ] Staging environment (instanced game libraries follow-up — the spec accepts a "no staging" caveat (§7.5: previews are read-only against prod, writes first run for real in prod); revisit with a second Supabase project or branching once the write path exists). **Promoted in priority 2026-07-28:** the preview `500 MIDDLEWARE_INVOCATION_FAILED` (since fixed — see Recently Completed) was this caveat biting for real. Pointing Preview at production's Supabase is the stopgap, but it means preview sign-ins are production accounts. A second Supabase project (own DB + own GoTrue + own Google OAuth client) would give previews a real identity system and finally let the write path be exercised somewhere that isn't prod
- [ ] Decide the routing/namespace strategy as the site grows into multiple apps. **Half-settled
      2026-07-29:** nesting per-user libraries under `/video-games/u/` committed to per-app route
      prefixes on one domain, i.e. option (a) below, for the game library. What is still open is
      whether that holds when a _second_ app arrives, and auth is still top-level (`/onboarding`,
      `/auth/*`) because it is a site-wide identity system. Options once more apps exist: (a) keep everything on `rgrassian.com` with top-level auth + per-app route prefixes — simplest, one shared session across apps; (b) split an app onto a subdomain like `games.rgrassian.com` — cleaner isolation and independent deploys, but subdomains are separate cookie origins, so sharing the login session needs a `.rgrassian.com` cookie domain plus Supabase/Vercel redirect wiring, which works against cross-app SSO. Leaning toward (a) until an app genuinely needs isolation.
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

## Recently Completed

_Newest first, capped at 20 — drop the oldest when adding past that._

- [x] **Instanced libraries Phase 5 — social graph** (2026-07-30, branch `phase5/social-graph`).
      Three slices: follow endpoints + auto-follow; Following/Followers tabs; the follow button
      and "Back to my library". 206 pytest, up from 175. User search was held back on purpose and
      has its own backlog item. Nothing to configure to ship it — the founder is a code constant
      (`FOUNDER_USERNAME`, mirroring `LIBRARY_OWNER_USERNAME`), and the planned backfill was
      written then deleted once it was clear prod has one account and so would gain zero edges.<br>
      **Far less new code than expected.** The `follows` table already existed from the baseline
      migration (composite PK, `no_self_follow` check, cascade from `profiles`), and `ProfileRead`
      already returned live `COUNT(*)` follower/following numbers — they read 0 only because the
      table was empty. The real gap was endpoints and UI. One index was genuinely missing:
      `ix_follows_followee_id`, since the composite PK indexes `(follower_id, followee_id)` and so
      cannot answer "who follows X?".<br>
      **The bug worth remembering:** SQLAlchemy emitted the `follows` INSERT _before_ the
      `profiles` INSERT when creating a profile plus its two founder edges, violating the
      `follower_id` FK. Cause: `Follow` declares no ORM `relationship()` to `Profile`, so the unit
      of work had no mapper dependency to order them. Fixed with an explicit `db.flush()` before
      adding the edges (still one transaction, so the commit stays all-or-nothing). It was
      disguised because `create_my_profile`'s `IntegrityError` handler re-derives the cause and
      reported it as **"username taken"** — so the symptom named the wrong column entirely. A
      founder handle naming no profile hits the same path, which is why it is resolved and
      verified before use: auto-follow is a nicety and must never be able to close signup.<br>
      **A review pass caught two more before merge**, both invisible to the tests that were
      passing: following while signed in but not onboarded was a 500 (`follows.follower_id` is an
      FK to `profiles`, and the relationship read deliberately answered "not following" for those
      users — which is exactly what rendered the button that 500'd); and signup's auto-follow
      never purged the founder's cache tag, so `/video-games` kept serving a stale follower count.
      Both now fixed and tested. Lesson recorded in the spec: any write that creates a follow edge
      changes both endpoints of it.<br>
      _Three deliberate departures from the spec's sketch:_ follow/unfollow are **idempotent**
      (204, not 409) because the button is a plain toggle with no conflict state to render;
      `/me/relationship/{username}` also returns `is_me`, letting the button decide
      "hide" vs "show Follow" in one request instead of racing a second `/me/profile` call; and
      `UserSummary` carries no per-row follow counts, which would turn one join into a correlated
      aggregate for numbers no row displays.<br>
      _Design note for anyone touching the tabs:_ `View` is now `GameView | PeopleView` with
      `VIEW_CONFIG` keyed to `GameView` only. That is load-bearing rather than tidy —
      `GameLibrary.tsx` branches on `view === "played"` in about a dozen places where the
      else-branch silently means "wishlist", so a flat four-member union would have rendered the
      wishlist filter bar and pipeline on a people tab. Keying group/sort config to `GameView`
      turned every one of those into a compile error until it was guarded.<br>
      _And the one that cost real time in Phase 3 too:_ a follow changes **two** libraries, so it
      revalidates two cache tags. The caller's still comes from their own token; the target's
      comes from the client, which `revalidateMyLibrary` explicitly warns against, so
      `revalidateOtherLibrary` documents why it is sound there and nowhere else (the worst a
      forged call achieves is re-fetching an already-public page).
- [x] **Game library nested under `/video-games`** (2026-07-29) — per-user libraries moved from
      `/u/{username}` to `/video-games/u/{username}`, so the app owns one prefix instead of
      leaking a top-level `/u` namespace. Settles the routing/namespace backlog item in favour of
      per-app route prefixes on one domain. Redirect added in `next.config.ts` next to the
      kebab-case ones, but **temporary (307), not permanent** — a 308 is cached by browsers
      more or less forever, and the spec plans for `/u/[username]` to become a cross-library
      profile hub if movie/book libraries materialize, which a permanent redirect would fight
      with no way to reach browsers holding the cached answer. There is no ranking to preserve
      on a URL that was live for two days. It is worth having at all only because
      `/u/{username}` was linked from `/video-games/start`, which is in `sitemap.ts` and is
      Google's App homepage, so crawlers have plausibly seen it.<br>
      Verified against `next start` that `/u/rgrassian`, `/u/RGrassian` and `/u/nosuchuser` all
      forward, that the unknown user still 404s after forwarding, and that the older snake-case
      redirects still chain to 200.<br>
      **Closed a real hole while in there:** `USERNAME_RE` accepts underscores and hyphens
      alike, but the reserved-username set only listed the underscore spelling of
      `video_games`, so **`video-games` was a claimable username** and would have sat
      confusingly beside the route. Rather than listing both spellings by hand, a
      `_both_spellings()` helper in `api/app/services/me.py` derives them, so a route name
      added later in either spelling is reserved in both. A test asserts that invariant over
      the whole set instead of over a few literals.<br>
      _Deliberately not done, contra the original entry:_ no `sitemap.ts` change. The sitemap
      already lists `/video-games`, which **is** Robert's library, so adding
      `/video-games/u/rgrassian` would submit two URLs for identical content. If that duplication
      bothers anyone the fix is a canonical link, which is its own concern.<br>
      _Worth knowing:_ the route-collision half of `RESERVED_USERNAMES` is now defensive rather
      than load-bearing on the web side, since a username can only appear under
      `/video-games/u/` and cannot shadow a site route at any depth. It still matters for the
      API's own `/users` namespace, so it stays.
- [x] **Auth UI now decides before first paint, not after hydration** (2026-07-29) — fixes both
      the sign-up CTA banner flashing at signed-in viewers and the `AuthButton` popping in a beat
      late. An inline `<script>` first in `<body>` (`src/app/layout.tsx`) reads the session cookie
      and stamps `data-authed` on `<html>`; two rules in `globals.css` drop whichever half of the
      auth UI does not apply. Both halves stay in the cached HTML for every viewer, so
      `/video-games` is still prerendered static: the served markup is identical and only the
      script's output differs. Logic in `src/lib/authFlag.ts`.<br>
      **The banner was the least valuable of the three things the original entry named.** The
      flash is nearly unreachable in practice: `/library` sends signed-in users to
      `/u/{username}`, so hitting `/video-games` with a session takes a typed URL, an old
      bookmark, or a shared link to Robert's library. The `AuthButton` pop-in is what justified
      the work: it hit every viewer on every load of both library routes.<br>
      _What it cannot fix, contrary to the original entry:_ the owner edit affordances. A cookie
      says a session exists, not whose it is (the JWT's `sub` is a user id, not a username), so
      `useIsLibraryOwner` still needs its `/me/profile` round trip. Own backlog item now.<br>
      _Two costs accepted:_ `sessionCookieKey` duplicates supabase-js's own storage-key
      derivation (`sb-${hostname.split(".")[0]}-auth-token`), so if that ever changes the flag
      silently stops setting and the flash quietly returns — it degrades rather than breaks, but
      nothing reports it. And a cookie present with an invalid session shows "Sign out" for a
      frame before the subscription corrects it, where before it showed nothing. That second one
      is narrower than it first looked: `src/middleware.ts` matches `/video-games` and
      `updateSession` calls `getUser()`, so a revoked or long-expired session has its cookie
      deleted by `Set-Cookie` on the same document response, before the script runs. The window
      only survives when the refresh fails for a network reason, since auth-js keeps the session
      then. Also note the cookie key is
      inlined at build time from `NEXT_PUBLIC_SUPABASE_URL`, so a local build bakes in
      `sb-127-auth-token` and Vercel bakes in the project ref.<br>
      _Bonus:_ `SignupCta` dropped `"use client"` entirely and now ships zero JavaScript.
- [x] **Browser pass on the Phase 4 UI completed** (2026-07-29) — the client-rendered surfaces
      that `curl` cannot see and that shipped unverified in PR #68: the sign-up CTA banner, the
      `AuthButton` relocated into the library header, the `?error=oauth_failed` /
      `?error=link_invalid` copy on `/video-games/start`, owner edit affordances appearing only
      on your own library, IGDB search in the add-game picker on prod, and the landing page in
      dark mode. Of these, the IGDB search check was the load-bearing one: it is the only thing
      that distinguishes working Twitch creds from absent ones, since
      `/api/py/igdb/search` returns 401 to an unauthenticated probe either way.<br>
      Only the known CTA banner flash was still outstanding afterwards, and it was fixed the same
      day — see the pre-paint `data-authed` entry above.
- [x] **Per-user library size cap shipped** (Phase 4 slice 6, PR #68) — `max_games` on
      `Settings` (`api/app/core/config.py:65`, default 2000, overridable by env var), enforced
      in `api/app/services/me.py` on both the game and wishlist create paths with a dedicated 403. The per-user write rate limits landed in the same slice, not in Phase 3 as an
      earlier note here claimed. Spec §9 decision #3 is therefore closed
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
      absent. Real confirmation was searching in the add-game picker on prod, done as part of
      the browser pass above
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
      Its manual steps (brand verification, Vercel env vars, prod migration) are all done and
      recorded as their own entries below
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
