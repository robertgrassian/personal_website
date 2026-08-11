# Project TODO

## Up Next

**The instanced game libraries project is done** (Phases 0-6, finished 2026-07-30 with PR #77).
Its spec, `docs/plans/instanced-game-libraries.md`, was **deleted on 2026-07-30** now that
everything in it either shipped or is tracked here: the durable parts moved into the root
`README.md` (auth model, the design decisions that still explain the code) and `api/README.md`
(the data model and its rationale), and `docs/supabase-primer.md` survives as the "why not
backend-as-a-service" argument. Nothing is mid-flight, so from here this file is the only plan.

The organizing goal is **sharing the site with people**, so Up Next holds what should be true
before that happens.

**Up Next is capped at 5, and being a bug is not what gets you in here.** Confirmed defects live
in **Bugs** below. This section is for work that is in flight, blocking the goal above, or a
promise the site already makes in user-facing copy but cannot honor — plus anything explicitly
asked for, which needs no reason and is marked `(Promoted by request YYYY-MM-DD.)` so it does not
get demoted back out. Adding a sixth item means demoting one, on purpose. (Split out 2026-08-07:
the old rule sent every bug straight here, so four of five slots were defects.)

- [ ] **Backfill `game_metadata.platforms`: a lot of rows are missing it.** (Promoted by
      request 2026-08-10.) The catalog migration seeded that column from `played_games.system`
      alone, so a library game carries exactly the one console it happens to be recorded on
      and a wishlist-only game carries an empty array. Measured on the local DB: **123 rows
      with no platforms at all, 157 with exactly one** — essentially nothing holds a real
      multi-platform list, which is the whole point of the column. Prod will differ in count,
      not in shape.<br>
      _The input already exists, and it is the only copy._ `api/scripts/.igdb_platforms.json`
      maps IGDB game id → its real platform list for 173 games. It was dumped by
      `backfill_igdb_ids.py` while that script was already making the network call, and
      **that script has since been deleted** — so this cannot be regenerated the same way.
      The file is gitignored and untracked, meaning one `git clean` loses it. **Copy it
      somewhere safe before doing anything else.** Loading it is an `UPDATE` joined on
      `game_metadata.igdb_id`; the work is in the decision below, not the SQL.<br>
      _The decision worth making on purpose: whose vocabulary the column speaks._ IGDB says
      "Nintendo Entertainment System" where the shelf says "NES". Storing IGDB's raw names
      keeps the row an honest catalog fact and matches where the data came from. Normalizing
      to shelf labels makes the column directly usable by the add form — but it bakes one
      user's naming into a row every user shares, and there is no per-user vocabulary to fall
      back on. Leaning toward storing IGDB's names and normalizing at read time, since
      `_build_platform_aliases` (`api/app/services/igdb.py`) already does that direction of
      the mapping. Decide before writing, because rewriting a shared column later is the
      expensive kind of change.<br>
      _What it will not cover:_ private catalog rows have no `igdb_id`, so the JSON says
      nothing about them. They keep whatever the migration seeded. That is correct rather
      than a gap — a hand-entered game has no canonical platform list — but it means
      "platforms is populated" will never be true for every row.<br>
      _Two follow-ups this does not include._ `platforms` is not on the API read schema
      (`api/app/schemas/users.py`), so nothing client-side can see it yet; exposing it is the
      same widening the duplicate-add bug wants. And **"Restrict the add-game 'system'
      suggestions to the platforms the game actually released on"** in Backlog is what this
      unblocks — that item used to claim this backfill as its own first step and now points
      here instead.

- [ ] **When adding a game, let me say I'm playing it now, or that I played it before: a play
      history section in the add-game form.** (Promoted by request 2026-08-09.) Two asks, one
      surface. **(1)** A one-tap control (a check mark was the suggestion) that marks the game
      currently playing as it is added, instead of adding it and then opening its pencil. **(2)**
      The fuller version: the same form can also record a past playthrough, so adding a game you
      finished years ago captures when. **Do not call it a "session" in the UI** — that is the
      database's word, and nothing user-facing uses it today. "Playing this now" plus something
      like "I've played this before" reads as one natural part of the add form.<br>
      _What exists to build on:_ `EditGameModal` already has both halves — a start/stop control
      and a "From"/"To" past-dates form — and both go through `logSession` in
      `video-games/actions.ts`, which takes `(gameId, startDate, endDate | null)` and treats a
      **null end date as the open session** that makes a game currently-playing. So "playing now"
      is a past-dates log with the end left blank, and the add form needs no new backend concept,
      only a new caller. `AddGameModal` today is the IGDB search step plus `GameDraftForm`, which
      has no session controls at all.<br>
      _The one real blocker, and it is not in the UI:_ logging a session needs the new game's id,
      and the add path throws it away. `POST /me/games` **does** return the created `GameRead`
      (see `create_my_game` in `api/app/routers/me.py`), but `mutate` in `meApi.ts` collapses
      every write to `MutateResult` (`{ ok: true }`), so `addGame` cannot tell the client what it
      just created. Either widen that result for the create path, or add a server-side
      add-and-start endpoint. The second is the thing to weigh: two sequential writes can leave a
      game added with its play history silently missing, so decide whether a failed session log
      rolls the add back, warns, or is simply accepted (probably accepted — a game in the library
      with no dates is a normal state).<br>
      _Library target only._ A wishlist entry is not in the library and has no game row to hang a
      session off, so this section must disappear when the target is `wishlist`. That collides
      directly with **"Fold '+ Add to wishlist' into a single '+ Add game'"** below, which adds a
      destination switcher inside this same modal: the switcher would have to show and hide this
      section, and decide what happens to dates already typed when you flip to wishlist. Sequence
      the two deliberately.<br>
      _Reuse, do not re-type, the date form._ **"Logging a past session should pick the whole
      range in one calendar popup"** below already plans to pull that From/To control out of
      `EditGameModal`; building a second copy here is what that item is trying to prevent. Same
      for **"Library-level 'create session' button"**, whose stretch goal ("add a game I just
      started and open its session in one go") is this exact gap approached from the other
      direction — folding them together is reasonable.<br>
      _This is the whole add-game screen's turn, per the ask._ Four other items touch this same
      form and are cheaper done in one pass than four: **"Remove genre keyword search when adding
      a game"**, **"Restrict the add-game 'system' suggestions to the platforms the game actually
      released on"**, the mobile combobox item (`<datalist>` does not work on phones), and the
      destination-switcher item above.

- [ ] **Rewrite `CLAUDE.md` and `README.md`: purge the stale facts and give both an architecture
      section.** (Promoted by request 2026-08-09.) Two documents, two audiences, one pass. The
      `CLAUDE.md` version optimizes for **an agent finding things fast**; the `README.md` version
      optimizes for **a human understanding what this is**, and wants the site's purpose up front,
      a dedicated game-library section (it is most of the repo), and an architecture section.<br>
      _Three wrong facts found already, which is the evidence the sweep is needed._ **(1)**
      `CLAUDE.md` routes the read path through "`src/lib/gamesServer.ts` (server-only)" — **that
      file does not exist.** `import "server-only"` is at the top of `libraryApi.ts` itself, which
      is the actual server boundary. **(2)** `CLAUDE.md` names `CrtTv.tsx` as the currently-playing
      component; the file is `CurrentlyPlaying.tsx`, and the CRT-TV bug entry in Backlog now says
      so too. **(3)** `README.md`'s Claude Skills table lists the skill as `todo` / `/todo`; it is
      `proj-todo`, and the whole point of that rename was that the skill gets invoked. Assume more
      of the same and verify every path, filename and command rather than re-reading the prose.<br>
      _What "help Claude find things" actually means, since it is the stated goal:_ a map from
      **task** to **file**, not a directory listing (an agent can already run `ls`). The things
      worth writing down are the ones that cost a search every time: the owner write path
      (browser → Server Action in `video-games/actions.ts` → `meApi.ts` → FastAPI `/me/*` →
      `revalidateTag`) is already there and earns its place; the read path is the same shape and is
      currently wrong; the API's routers → services → repositories layering lives in
      `api/README.md`; and the filter/group/sort pipeline (`pipeline.ts`) has no pointer anywhere.
      Worth adding a "where does X live" table for the recurring destinations: shelf UI, modals,
      auth, migrations, tests.<br>
      _Watch the size budget._ `CLAUDE.md` is loaded into context on every single session, so
      every line competes with the actual task, and a long file is what gets skimmed. It is 88
      lines today. An architecture section that grows it past roughly double should push detail
      into a linked doc instead: `docs/` already holds `dev-setup.md`,
      `genre-backfill-runbook.md` and `supabase-primer.md`, and `api/README.md` already owns the
      data model. The conventions section carries a warning about exactly this failure mode — the
      `proj-todo` rules were duplicated into `CLAUDE.md`, and having them in context is what made
      the skill look redundant and got it skipped for a session. Do not undo that lesson by
      inlining `api/README.md` here.<br>
      _Liked, 2026-08-09: put an architecture **diagram** in `docs/`_ and have both files link to
      it, which is also how the size budget above gets respected — the diagram carries the shape,
      `CLAUDE.md` keeps only the pointers an agent needs to open a file. Draw it in **Mermaid**
      rather than exporting an image: GitHub renders ` ```mermaid ` blocks natively, so it stays
      diffable text that can be corrected in a PR instead of a binary nobody updates. The request
      flow is the diagram worth having (browser → Server Action → `meApi.ts` → FastAPI routers →
      services → repositories → Postgres, with the read path and `revalidateTag` alongside),
      since that is the thing this repo's structure actually encodes. `docs/dev-setup.md` is the
      neighbor to match for tone.<br>
      _Do not duplicate what the two files each own._ `README.md` today already has Features, Tech
      Stack, Authentication, Design decisions, Getting Started, Scripts, Game Library Data and
      Claude Skills, and `api/README.md` has the data model and its rationale. The risk in adding
      "architecture" to both is three descriptions of one system drifting apart. Decide which file
      is canonical for each fact and have the others link to it.<br>
      _One thing to decide, not just execute:_ `README.md` is the repo's public face on GitHub, and
      the purpose section is written for a stranger — likely someone looking at this as work,
      given the site hosts a resume. That is a different voice from the rest of the file, which is
      setup instructions. Worth writing it deliberately rather than as another bullet list.

## Bugs

_Confirmed defects that are not urgent enough for Up Next. Roughly severity-ordered, worst first.
Promote one into Up Next when it starts blocking the sharing goal above, and demote something else
to keep that section at five._

- [ ] **On mobile, filtering down to one shelf leaves the result hidden under the filter bar (or
      under the keyboard), so you cannot see what you just found.** Reported 2026-08-09, on a
      device. Repro: scroll down the library, scroll up slightly so the sticky bar comes back,
      then type a search that matches a single row while the keyboard is still up. The matching
      shelf renders where you can barely see it: a sliver of a case, sometimes just the plank. You
      have to scroll or dismiss the keyboard to see the result. Listed first here because it hits
      **any** visitor on a phone, not just the owner, and searching is the main thing a stranger
      does with someone else's library.<br>
      _Premise correction on the suspected cause:_ "we need to render under the filter bar" is
      already what happens. `FilterBar` is `sticky top-[var(--nav-height)] z-20` and sits in
      normal flow, so the shelves come after it in layout and cannot be painted behind it. The
      overlap is not a stacking problem, which means a z-index or padding fix will not touch
      it.<br>
      _Most likely the real mechanism, and it is two things at once — confirm on a device before
      fixing._ **(1) Nothing in the app ever scrolls after a filter.** There is no `scrollIntoView`,
      `scrollTo`, `scroll-margin` or `visualViewport` usage anywhere in `src/` (checked
      2026-08-09). Filtering 155 games to one shelf collapses the document height, the browser
      clamps `scrollY` to the new maximum, and wherever that lands is where you stay: the one
      surviving shelf can easily end up at the very top of a now-short page with the sticky
      chrome over it. **(2) iOS keyboard and viewport units disagree.** `position: sticky` resolves
      against the **layout** viewport, which does not shrink when the keyboard opens; only the
      **visual** viewport does. So with the keyboard up, the space the user can actually see is a
      band that the sticky bar was not positioned against, which is exactly why this reproduces on
      a phone and not in desktop devtools — devtools mobile emulation has no keyboard.<br>
      _What the fix has to get right, since "just scroll to the results" has traps._ Scroll only
      when the result set actually changes and only **upward**, or it will yank the page while
      someone is reading. Drive it off the deferred search value, not the raw input:
      `GameShelves` already runs the pipeline through `useDeferredValue`, so a per-keystroke
      scroll would fight the typist. The landing offset must clear nav height **plus** the bar's
      own height, which is what `scroll-margin-top` on the shelf container expresses more cleanly
      than arithmetic in a `scrollTo`. And whatever it does must not blur the search input:
      dismissing the keyboard mid-search would trade this annoyance for a worse one.<br>
      _The `visualViewport` API is how the keyboard half gets solved_ if step one is not enough:
      it reports the real visible band and fires `resize`/`scroll` when the keyboard opens. Note
      `FilterBar` already keeps a hand-rolled scroll model on mobile (a `stickyThresholdRef`
      snapshotted once in `useLayoutEffect`, plus a hide-on-scroll-down toggle behind a 640px
      media query listener), so this belongs alongside that logic rather than as a second
      independent scroll listener.<br>
      _Not reproducible without hardware._ Same class as the mobile flip-lag bug in Recently
      Completed, which burned two plausible-but-wrong fixes before a device confirmed the real
      one: get this verified on a phone before and after, rather than shipping on reasoning.

- [ ] **Anyone can define a shared catalog row for everyone, because `igdb_id` is never
      checked against IGDB.** Found in the code review of the catalog migration (PR #105,
      2026-08-10) and documented as a known gap in `api/README.md`. `create_my_game` takes
      the client's `igdbId` on trust: `find_or_create_metadata` looks the id up and, finding
      nothing, creates the SHARED row from whatever `name`, `genres` and `releaseDate` the
      payload carried. So `POST /me/games {"name": "anything", "igdbId": 1051}` from any
      onboarded account defines Chrono Trigger's catalog row, and **every user who adds that
      game afterwards inherits it**. First-write-wins, with no repair path: nothing in the UI
      edits a shared row, by design.<br>
      _Why this is filed here and not in Up Next:_ it needs a second account acting badly,
      and there is one user. Ranked above the duplicate-add item below because the damage is
      silent, shared, and currently unrepairable from the app.<br>
      _What already bounds it, so the fix is not urgent:_ `max_users` is 100 and signup is
      capped (`api/app/core/config.py`); every `/me/*` write goes through `rate_limit_writes`
      (`api/app/core/guards.py`); and `validate_igdb_image_url` restricts `imageUrl` to the
      IGDB CDN, so the cover can only be swapped for another real IGDB cover, never for
      arbitrary content.<br>
      _The fix, and its cost:_ verify the id against IGDB inside `create_my_game` and build
      the catalog row from **IGDB's** answer rather than the client's. That puts a network
      call in the write path, which is the thing to weigh: the add flow already called IGDB
      once to find the game, so this is a second call for data the client just received.
      Cheaper variants worth considering first: only verify when the row does not yet exist
      (the common case is a hit, which costs nothing), or accept the client's values and
      reconcile in a background sweep. Note `igdb_search` already has its own rate-limit
      bucket (`api/app/services/igdb.py`) that a write-path lookup would need to either share
      or deliberately bypass.<br>
      Related: **"Make library and wishlist entries fully editable"** has to answer the
      neighbouring question — whether editing a shared row forks a private copy, restricts
      the edit to private rows, or genuinely changes the game for everyone. Answer both
      together; they are the same question about who owns a catalog row.

- [ ] **You can add a game you already have in your library. Reject a duplicate add
      server-side, and decide what "duplicate" means.** Reported 2026-08-08. **Mostly closed
      2026-08-10 by the catalog migration** — kept open only for the follow-up in the last
      paragraph. `create_my_game` now resolves the game to a `game_metadata` row and checks
      `find_game_by_metadata`, with `UNIQUE (user_id, metadata_id)` as the concurrency
      backstop, so a duplicate add is a 409 whatever console it names. "What duplicate means"
      was answered by the identity rule: same `igdb_id`, or same name among that user's own
      hand-entered games.<br>
      _What is left, and it is a real gap._ The 409 currently has **no escape hatch**: with
      `GameUpdate` still rating-only there is no way to change which console an entry
      records, so "I own this on SNES and just got the DS version" is a dead end. That fix
      lives in **"Make library and wishlist entries fully editable"** in Backlog, which now
      leads with it. Close this item once that ships.<br>
      _Historical, kept because it explains the current UI._ **The search half
      shipped 2026-08-09** (branch `claude/duplicate-add-warning`): `GameLibrary` now builds a
      folded-name → systems map and threads it through `AddGameModal` to `GameSearchStep`, so a
      result you already have renders a third line reading "In your library: SNES, DS" (or "On
      your wishlist"). It annotates and never blocks, because the remaining question is exactly
      what it must not answer on its own.<br>
      _Still true about that annotation, and worth revisiting._ It matches on **folded names**,
      not on `igdb_id`, because `igdb_id` is on the create payloads but **not on the API's read
      schema** (`api/app/schemas/users.py`) and so not on `Game` or `WishlistGame`. The server
      now keys the real check on the catalog row, so the client annotation is looser than the
      rule it is previewing: it can say "in your library" for a same-named game the server
      would happily accept, and miss one it would reject. Tightening it means exposing
      `metadataId` (or `igdbId`) on the read schema, the repository projection and
      `libraryApi.ts`, which adds one int per row to the cached `/video-games` payload.<br>
      _Note the 2026-08-09 "systems as a list" decision was reversed_ (2026-08-10) in favor of
      one entry per game with a single `system`; see the catalog entry in Recently Completed.
      **"Overhaul the wishlist promote flow"** hits the identical identity question one column
      over and can now reuse the same `metadata_id` lookup.

## Backlog / Ideas

- [ ] **Add a sort by rating option to the library**. Obviously doesnt make sense if grouped by rating, so in that case dont show it (and validate, dont allow it) but for other groups or no-group allow it. Example, its cool to be able to group by decade or system and sort by rating to see my favorites for that group.

- [ ] **Detect where the title sits on a game cover, and crop the CRT picture so it is not cut
      off.** The TV screen is landscape and cover art is portrait, so `object-cover` throws away
      most of the height. Today every game gets the **same** hardcoded crop:
      `object-cover [object-position:center_22%]` on the `<Image>` inside `.crt-picture`
      (`CurrentlyPlaying.tsx` — note the component is not `CrtTv.tsx`, despite what CLAUDE.md
      says). 22% is a guess that titles sit high; when they don't, the title is sliced.<br>
      _The framing that matters, per the ask:_ the goal is **not** to center the title. It is the
      smallest shift that brings the title fully inside the visible band, so the rest of the key
      art keeps as much screen as possible. That makes the output a single number per cover — a
      vertical `object-position` percentage — and the algorithm "clamp the crop window to contain
      the title's bounding box, then stop moving". Falls back to the current 22% when nothing is
      detected or the title is already contained. Storing a percentage rather than a cropped
      derivative keeps `next/image` doing the resizing and avoids a second copy of every cover.<br>
      _Do this offline, not in the browser._ Running detection per render would mean shipping a
      vision model to the client and re-deciding the crop on every page load, for a value that
      never changes once the art is known. The precedent is already here: cover art and genres are
      both populated by backfill scripts (`scripts/fetch-covers.ts`, `scripts/backfill_genres.py`,
      with `docs/genre-backfill-runbook.md` as the preview-then-apply habit). So this is a script
      plus a stored column, run once over existing rows and once per new game on add.<br>
      _Which table is now settled._ The focal point is a fact about **the artwork**, not about
      a user, so it belongs on `game_metadata` — the shared catalog row, which shipped
      2026-08-10 — as one more nullable column beside `image_url`. Computed once per cover
      rather than once per user who owns the game, which is the whole reason to wait for the
      catalog rather than adding it to `games`. Same reasoning says the stored value could
      serve `GameCaseBack`/`GameCase` later, not just the CRT.<br>
      _On the library choice, and this is the part to validate before committing:_ what is wanted
      is text **detection** (bounding boxes), not OCR (reading characters). Full OCR on stylized
      game logos is unreliable, and we do not care what the title says. Detection-only models
      (EAST, CRAFT and similar) are the closer fit; `tesseract.js` and the Python Tesseract
      bindings are the obvious first hits but are solving the harder problem. A hosted vision API
      would work too and adds a paid dependency and a key for a one-off batch over ~155 covers,
      which seems like the wrong trade. **All of this is reasoning from the outside — nothing here
      has been tried.** Spot-check whichever candidate on a dozen real covers (a logo in a script
      font over busy art is the hard case) before wiring anything up.<br>
      _Worth trying first, because it may be enough:_ IGDB cover art is heavily conventionalized,
      and a crude signal like "the row band with the highest edge density in the top third" may
      place titles about as well as a model, with no dependency at all. If a cheap heuristic gets
      most covers right, the remaining handful can be a hand-set override column, which is also the
      escape hatch any automated version needs anyway.

- [ ] **Remove genre keyword search when adding a game.** This was added as a helpful way to
      find games, but its not really useful in practice and adds complexity and latency, we
      should remove it.

- [ ] **Editing a game should need a "Confirm" press before the change takes effect.** Today a
      rating write fires on the click itself: `RatingPicker`'s `onPick` calls `rate()` in
      `EditGameModal.tsx`, which runs the `updateGameRating` Server Action immediately, so there
      is no moment between picking a value and it being saved. The same is true of every other
      control in that dialog (start/stop session, log a past session); `AddGameModal`'s rating
      picker is the exception, since it is part of a form that already has a submit button.<br>
      _What makes this more than adding a button:_ the rating picker is wired to `useOptimistic`
      precisely because the write is instant, and `optimisticRating` is also what the "Remove
      rating" button and the unrated hint below it read. Deferring the write turns that into
      ordinary draft state (pick → local value → Confirm → action), so the optimistic hook either
      goes away or moves to wrap the confirm. Decide too whether Confirm covers the whole dialog
      or just the rating: `stopPlaying` applies a rating **atomically with closing the session**
      on the API side, so a per-field confirm has to leave that path alone or it splits one write
      into two.<br>
      _Counter-argument worth keeping:_ one tap to re-rate a game is the nicest thing about the
      current modal, and rating is already reversible from the same dialog. A confirm step earns
      its cost mainly once the modal is a real multi-field form, which is exactly what the "make
      library and wishlist entries fully editable" item below plans, and that item would supply a
      Save button for free. Worth deciding whether to do this on its own or fold it into that.<br>
      Note the pattern already exists for destructive actions: `ConfirmStep.tsx` is a two-step
      trigger → prompt → confirm control used by "Remove from library". Related: the
      "confirmation toast" item below is the other half of this (knowing a write landed), and the
      audit-log/undo item directly below is the alternative answer to the same worry — undo after
      the fact instead of confirm before it.
- [ ] **An audit log of important library actions, primarily so a change can be undone.** No such
      table exists today: `api/app/models/` holds only `profile`, `game`, `wishlist_item`,
      `follow` and `igdb`, and nothing in the write path records what changed. Rating a game
      wrongly, deleting a game, or promoting a wishlist entry are all one-way from the UI.<br>
      _The ask, in order of what it is for:_ **(1)** undo, implemented by replaying from the log
      (undoing "rating A → B" is a normal write of A, itself recorded as a new row); **(2)** a
      general record of important actions to grow other features on: a recent-activity feed,
      per-game change history.<br>
      _The design decision everything hangs on: what a row holds._ An action name plus
      before/after values as JSON is enough for undo and cheap to write, but it is a second copy
      of the data that can drift. Deleting a game is the case that forces the issue:
      `play_sessions` cascades on game delete (there is a comment on the FK in
      `api/app/models/game.py`), so undoing a delete cannot restore the sessions unless the log
      row carried them, and a restored game gets a new id, orphaning any later log row that
      referenced the old one. Decide whether delete is undoable at all, or whether undo covers
      only field edits.<br>
      _Where it gets written:_ every owner write goes routers → services → repositories under
      `/api/py/me/*`, so the log belongs at the service layer, in the same transaction as the
      change — a log entry that can go missing is not one you can undo from. Note
      `rate_limit_writes` commits **separately** on purpose, for the opposite reason (see the
      Tier 3 refactor item above); do not copy that shape here.<br>
      _Two smaller things to settle:_ retention, since this is the one table with no natural cap
      (`max_games` bounds rows, nothing bounds edits); and whether undo is an affordance with a
      time window (an "Undo" link in a toast, which wants the toast item below first) or a
      history view the owner browses. Either way decide what happens when state moved on:
      undoing a rating edit after a later edit should probably refuse rather than silently
      overwrite.

- [ ] **Make database migrations run automatically as part of CD**, instead of `alembic upgrade
head` being run by hand from a laptop pointed at production.<br>
      _Premise correction, and it is most of the work:_ there is no CD pipeline to add a step to.
      `.github/workflows/ci.yml` has only `build` and `api` jobs, both of which test; deploys
      happen through Vercel's own GitHub integration, and `vercel.json` contains nothing but the
      daily health cron. So this means **creating** a deployment workflow, not extending one.<br>
      _The ordering problem is the real design question._ Vercel offers no pre-deploy hook, so a
      GitHub Action triggered on push to `main` races Vercel's build: whichever finishes first
      wins, and if the deploy lands first there is a window where new code queries an old schema.
      The usual answer is to make every migration backward-compatible (expand, migrate, contract
      across separate deploys) so the race stops mattering — that is a discipline to adopt
      deliberately, not something the workflow enforces. Worth deciding before automating, since
      the whole value of automating is not thinking about it each time.<br>
      _Two things that must not be got wrong:_ **(1)** preview deploys must never migrate. They
      point at production through a read-only role, so a migration from a preview branch is
      either an error or a disaster depending on the role. Gate on the branch, not on
      `APP_ENV`. **(2)** the production connection string becomes a GitHub secret, where today it
      exists only on your laptop and in Supabase. That is a genuine expansion of where the
      credential lives, and worth weighing against how rarely migrations actually run.<br>
      _Counter-argument worth keeping:_ auto-applying means a migration reaches production
      without anyone reading its plan first. This project's habit so far is the opposite —
      `docs/genre-backfill-runbook.md` exists because a preview-then-apply pass caught real
      damage that a green test run had missed. `alembic upgrade head` is idempotent and safe to
      re-run, so a middle option is a workflow that runs it on manual dispatch only: no laptop
      credentials, still a human deciding when.<br>
      Note `alembic/env.py` reads the URL from `DATABASE_URL` via the settings object with no
      alias, and `normalize_database_url` rewrites the `postgresql://` scheme itself, so the
      workflow can pass Supabase's connection string through unmodified.

- [ ] **The four _backend_ structural refactors left over from the game-library simplification
      review.** Was nine; the five frontend ones landed on `tier3/frontend-refactors` (2026-08-07):
      `AddGameModal` split at its `draft === null` seam, `GameShelves` extracted from
      `GameLibrary`, edit permission moved to `LibraryEditingContext`, the founder special case
      hoisted out of `LibraryPage`, and the per-keystroke render wins. Tiers 1 and 2 shipped
      earlier in PR #87. **Full write-ups for all nine are in git history at commit `f0a0cbb`,
      `docs/game-library-simplification-backlog.md`.** Do the rest one PR at a time, not as a
      batch. Note the backend items need the throwaway-Postgres test setup that doc describes:
      a bare `uv run pytest` skips 173 tests, so a green run without `DATABASE_URL` proves
      almost nothing. That Postgres also needs `api/scripts/ci_auth_schema.sql` loaded first,
      a stand-in for the `auth.users`/`auth.identities` tables GoTrue owns everywhere else and
      that migration `f985740c0df9` puts a real FK against; `.github/workflows/ci.yml` already
      does this and is the thing to copy locally.<br>
      _The one carrying a real decision:_ `rate_limit_writes` commits its counter increment in
      its own transaction, which under `NullPool` costs a second physical connect per write.
      Folding it into the handler's transaction removes that — but the charge is committed
      separately _on purpose_, so it survives a handler that raises. Fold it in and a failed
      write stops counting against the budget, which is a rate-limit bypass. **Decided
      2026-08-07: leave it alone**, because a caller who reliably triggers a 500 would otherwise
      get unlimited attempts. Close this one by documenting why the extra connect is paid, not
      by changing code. Reopen only with a measurement showing the connect actually hurts.<br>
      _The other three:_ add a `CurrentProfile` FastAPI dependency so six `/me` routes stop
      re-fetching the profile by hand, which also breaks the odd `services/follows.py` →
      `services/me.py` import (its cost: the per-action wording, "adding games" vs "following
      people", is lost unless you parameterize the dependency — that is user-facing copy, so
      decide deliberately); split `services/genres.py` (~620 lines) into a pure vocabulary
      module and a Wikipedia client, which is what `scripts/backfill_genres.py` actually reaches
      into, with `services/igdb.py` having the identical shape and fix; and, ranked last on
      purpose, deriving play state in SQL. `derive_play_state` is a pure, unit-tested function
      (`tests/test_play_state.py`), and moving it into SQL trades Python you can test for SQL
      you cannot, for six session rows across 155 games. If you touch it at all, take only the
      cheap half — select the four columns instead of whole ORM objects.<br>
      _Now unblocked, and cheap:_ making `Game.id`, `sessionCount` and `openSessionId`
      non-optional. It is correct (the API schemas mark them required, and the optionality
      forces guards that can never fire) and it was deferred only because it touched the same
      components as the frontend splits. Those have landed, so this is the easy follow-up it
      was waiting to become.

- [ ] **Move the Following/Followers tabs to their own route.** The honest altitude answer that
      the `GameShelves` extraction deliberately did not take: the follow lists are a different
      _page_, not a different tab. `/video-games/u/[username]/followers` would match the "library
      owns the prefix" convention, let `PeopleList` stay a server component, and stop the follow
      graph crossing the client boundary on every library render (`LibraryPage` currently fetches
      `getFollowers`/`getFollowing` on every load and threads both through `GameLibrary`).<br>
      _Why it is not a cleanup:_ it is a routing change. Existing `?view=followers` and
      `?view=following` URLs need redirects, `LibraryPage`'s five-way `Promise.all` fan-out
      changes shape, and the tab strip in `GameLibrary` has to decide whether those two tabs
      become links rather than `setView` buttons.

- [ ] **Show a confirmation toast after logging a session, so you know it worked.** Possibly with
      a "view all sessions for {game}" link in it, per the item below.<br>
      _What happens today:_ on success `saveLoggedSession` collapses the form and clears the
      fields (`EditGameModal.tsx`) and the dialog stays open. So there is _a_ signal, just
      not an affirmative one, and only failure gets words (`setError`). The gap is worst for a
      backdated **closed** session: nothing else on screen changes, because a past session with an
      end date moves no shelf and does not light up the CRT. An open-ended log is the opposite
      case, where the game becomes currently-playing and the change is obvious.<br>
      _One thing this codebase already gets right:_ `isPending` deliberately spans the whole write
      _plus_ revalidation (comment at `EditGameModal.tsx`), so a toast fired when the
      transition settles is telling the truth about the data having landed, not just about the
      request having been accepted.<br>
      _What makes it more than a `<div>`:_ there is **no toast infrastructure anywhere in `src/`**
      today, and no `aria-live` region either, so this is a small design decision about a
      site-wide primitive, not a local one. Decide up front whether it is a global toast host in
      the root layout (reusable by every owner write: rating, add, delete, wishlist, follow) or an
      inline "Saved" line inside the modal (far cheaper, no portal, no timers, but useless for the
      writes that close their dialog). It needs `role="status"` so screen readers announce it,
      and both color schemes. Note a link inside a toast raises a question the inline version
      does not: the edit modal is still open, so "view all sessions" has to decide whether it
      replaces the modal's contents or closes it and navigates.
- [ ] **An easy way to view a game's sessions, and ideally edit old ones.** Requested alongside
      the toast above as its own item, then re-asked 2026-08-07 with the editing half attached:
      today you can create sessions and close them, but nothing in the UI ever lists them, and
      nothing anywhere can change one after the fact.<br>
      _Two-thirds of the backend already exists, in a useful way._ `list_play_sessions`
      (`api/app/repositories/users.py`) already loads every raw `play_sessions` row for the
      whole library on every read, then collapses them into the five derived fields `GameRead`
      exposes (`session_count`, `currently_playing`, `last_played`, `playing_since`,
      `open_session_id` — `api/app/schemas/users.py`). So the rows are in hand server-side and
      no new query is needed. What does not exist is any **GET** for sessions: `me.py` has only
      `POST /me/games/{id}/sessions` and `PATCH /me/sessions/{id}`, and
      `users.py` exposes none at all.<br>
      _The decision that shape hangs on:_ widen `GameRead` to carry the session list, or add a
      dedicated endpoint. Widening is nearly free to implement but inflates every library payload
      (155 games' worth of session rows) for a detail almost nobody opens, and that payload is
      the prerendered, cached `/video-games` page. A dedicated read is more code but keeps the
      shelf payload lean. If it becomes a public endpoint rather than a `/me/*` one, remember
      libraries are public, so sessions become public too: decide that on purpose.<br>
      _Editing is the more expensive half, and the backend genuinely does not do it._ `PATCH
/me/sessions/{id}` looks like a general session edit but is not: its body is `SessionClose`
      (`api/app/schemas/me.py`), which carries only `endDate` plus an optional rating, and
      `close_my_session` 409s on a session that is already closed. So changing a past session's
      start date, correcting its end date, or deleting a session logged against the wrong game all
      need new endpoints (a real `SessionUpdate` and a `DELETE`) plus service and repository work,
      not just UI. Two rules the create path already enforces and any edit must re-enforce:
      `endDate` not before `startDate`, and at most one open session per game (`create_my_session`
      returns 409 otherwise) — reopening a closed session by clearing its end date walks straight
      into that. Deleting the last session of a currently-playing game also silently un-plays it,
      which is a visible change to the CRT and worth confirming in the UI rather than just
      doing.<br>
      _Where it lives is open._ Options: a section in the edit modal (owner-only, closest to
      where sessions are created), or part of the richer game-details view that the "make viewing
      a game's details better" item below is already circling — that item wants a bigger reading
      surface, and so does this. Editing pushes it toward the bigger surface: a list of rows each
      with two dates and a delete is more than the edit modal comfortably holds. Related: the
      "notes / play journal" item below floats hanging dated entries off `play_sessions` rather
      than the game row, which would make this the same screen; and the audit-log/undo item above
      is the safety net for a mis-clicked session delete.

- [ ] **Logging a past session should pick the whole range in one calendar popup**, instead of
      picking the start, hitting check, then the end, hitting check again. Noticed on mobile
      2026-08-06; it is the same on desktop, since the cause is not mobile-specific.<br>
      _What is there now:_ two independent `<input type="date">` controls, "From"
      (`EditGameModal.tsx`) and "To", inside the `logOpen` block. Each opens the
      platform's own picker, so two dates means two sheets and two confirmations. They are
      already linked in the only ways HTML allows: `min={logStart}` on the To field, `max` of
      today on both, and a `logDatesInvalid` guard disabling Save on an inverted range.<br>
      _The constraint that rules out a stock range picker:_ the end date is optional on purpose.
      "Leave 'To' empty if you're still playing it" logs a backdated session that is
      still open, which is what makes the game currently-playing. Most range pickers model a
      range as two required endpoints, so whatever is used needs a first-class "no end yet"
      state, not a blank the user must understand to leave alone.<br>
      _The real cost is leaving native inputs behind._ `type="date"` is free today: no
      JavaScript, correct locale, correct on every platform, and accessible without effort. A
      range calendar means a dependency (react-day-picker or similar) or a hand-rolled one, plus
      keyboard support, focus management inside an already-open dialog, and both color schemes
      per the light/dark rule. Weigh that against a two-tap annoyance on a control the owner uses
      a handful of times a week. A cheaper middle ground worth considering first: default "To"
      to the start date once "From" is set, so the common single-day session needs no second
      pick at all.<br>
      Related: the "library-level create session button" item below plans to reuse this same
      past-dates form, so whatever this becomes should be a shared component rather than more
      markup inside `EditGameModal`.

- [ ] **Make viewing a game's details better: the back of the case truncates genres and there is
      no way to see the rest. Design is part of this task.** `GameCaseBack.tsx` renders
      `genres.slice(0, 2)` plus a `+N more` span — and that span is plain text, not a control,
      so the hidden genres are genuinely unreachable from the shelf. Genres are the only
      truncated field: name is `line-clamp-2`, system and release date render in full.<br>
      _Two things to hold onto, per the ask:_ keep the rotating case, it is the best thing on
      the page; and do **not** solve this by cramming more onto the back face, which is a
      ~2.5rem-tall text column at `text-[10px]` and already full.<br>
      _Leading candidate, added 2026-08-07:_ **clicking a case makes it grow and travel to the
      center of the screen as it flips**, so the back face is a full reading surface rather than
      a 96px-wide column: every genre listed, and plausibly the owner edit controls hosted right
      there on the back instead of in `EditGameModal`. This would _replace_ the truncation problem
      rather than work around it, which is why it is written as this item's likely answer rather
      than a separate one.<br>
      _What that shape costs, since it is more than a scale transform:_ the case is
      `w-24` inside `ShelfSection`'s `repeat(auto-fill, 96px)` grid, so a case that grows in place
      either reflows the shelf or gets clipped by it. The enlarged case therefore wants to leave
      the shelf flow (a portal or a fixed-position overlay with a scrim) while a placeholder holds
      its slot, and the flip animation and the travel animation have to be one continuous motion
      or it will read as two separate things happening. `.game-case-inner` currently owns both the
      `preserve-3d` flip and the `group-hover` lift (`src/app/video-games/video-games.css`), so
      whichever element animates position cannot be that same element without fighting its
      transform. Note the mobile flip-lag bug in Bugs above is about this exact element: fix that
      first or this lands on top of it.<br>
      _If edit moves onto the back face, decide what happens to `EditGameModal`._ It is not just
      a rating picker — it holds start/stop session, log a past session, remove from library, and
      the `useOptimistic` rating write. Hosting all of that on a card face means either the card
      becomes the modal (and `EditGameModal` is deleted) or the two coexist and drift. Related and
      pulling the same way: "make library and wishlist entries fully editable" wants one shared
      field form in both modals, and "an easy way to view a game's sessions" explicitly wants a
      bigger surface than the edit modal comfortably holds. Sequence those three deliberately.<br>
      _Smaller alternatives, kept in case the big version is too much:_ a "more" affordance on
      the back that opens a popup with the full metadata, a hover/long-press tooltip listing all
      genres, a details panel that slides in beside the shelf rather than over it, or making
      each genre a chip that sets the genre filter (which turns the overflow problem into a
      navigation feature).<br>
      _The wiring detail that will bite whichever design wins:_ the entire case is one
      `<button>` with `onClick={() => setFlipped(f => !f)}` (`GameCase.tsx`), so a
      clickable element **inside** the back face is a button nested in a button, which is
      invalid HTML and unreliable for keyboard and screen-reader users. `GameCase` already
      solved this once for the owner pencil: it is an absolutely-positioned **sibling** of the
      flip button, not a child (there are two comments in `GameCase.tsx` explaining exactly
      that, one above the flip button and one on the pencil). Follow that pattern, or make the
      back face stop being a button. Whatever opens must also work on touch, where there is no
      hover.<br>
      Related: the "notes / play journal" backlog item below wants a bigger reading surface for
      per-game data too, so a details view built here is likely where notes end up living.

- [ ] **Set up monitoring / alerting, specifically to get notified when a new user signs up for
      the game library.** There is nothing today: no error tracking, no analytics, no email or
      webhook plumbing anywhere in the repo. The only observability is stdlib `logging` in a
      handful of places (`api/app/services/me.py`, `core/supabase_admin.py`) landing in
      Vercel function logs, which nobody watches.<br>
      _The event to hook is the profile insert, not the auth user._ OAuth mints a Supabase
      `auth.users` row before onboarding, so an abandoned onboarding leaves one with no profile,
      and an over-cap signup has its auth user deleted again
      (`create_my_profile`, `api/app/services/me.py`). The single moment that means
      "a real person joined" is `create_profile_with_follows` succeeding at line 307.<br>
      _What makes it more than a POST in the handler:_ the API runs as a Vercel serverless
      function (`api/index.py`), so there is no daemon to watch anything. Two shapes, and they
      trade off differently. **(a) In-request notify** — fire the webhook right after the profile
      commits. Simple, but it must follow the rule already written a few lines above it for
      auto-follow: a nicety must never be able to close signup, so it needs its own try/except and
      a timeout, and a serverless function may be frozen before a fire-and-forget task runs.
      **(b) Out-of-band** — a Supabase Database Webhook on `INSERT INTO profiles`, or a small
      endpoint polled by cron. Zero risk to the signup path and zero app code for the webhook
      flavor; the cron flavor has precedent, since `vercel.json` already runs one daily against
      `/api/py/health`.<br>
      _Decide the channel too_ (push, email, a Slack/Discord incoming webhook). Email means
      standing up a transactional provider that does not exist yet; a webhook does not. Note the
      volume this is sized for: `max_users` is 100 (`api/app/core/config.py`), so this is a
      handful of notifications ever, which argues for the cheapest thing that works.<br>
      Related but different: the **Analytics on signups** item below wants the funnel (how far
      people get from landing to first game), where this one wants a ping when someone lands.
      Its privacy-policy caveat applies here only if the answer is a third-party script.
      Worth deciding together whether the same pass should also alert on errors, since "I want to
      know when something breaks" is the other half of monitoring and has no item at all.

- [ ] **Document the database restore procedure.** Supabase takes daily backups on the free
      tier, so the backup half is already handled and needs no work; what does not exist is any
      written answer to "the data is gone, now what". Carried over from the spec's Phase 6
      when that document was deleted (2026-07-30). An untested restore is not a backup: the
      useful version of this is running one against a scratch project once and writing down
      what actually happened, in `docs/dev-setup.md` or beside it. Note the free tier's
      retention window is short (days, not months), which is the real limit worth knowing
      before it matters.

- [ ] **Add public libraries to `sitemap.ts`.** Carried over from the spec's Phase 6
      (2026-07-30). Today the sitemap lists static routes only; `/video-games/u/[username]`
      pages are public and indexable but unlisted, so search engines reach them only by
      crawling follower lists. Deliberately skipped once already (2026-07-29, recorded in
      Recently Completed) on the grounds that one hardcoded username in a sitemap is worse
      than none. With real signups that reasoning inverts: the entry becomes a generated list.
      Wants a decision on whether users can opt out of indexing, since spec decision #6 made
      every library public with no privacy setting, and "public" and "indexed by Google" are
      not the same promise.

- [ ] **Analytics on signups.** Carried over from the spec's Phase 6 (2026-07-30), and the
      only Phase 6 item with no groundwork at all. The narrow question worth answering is how
      far people get: land on `/video-games` → click sign in → complete OAuth → pick a username
      → add a first game. The onboarding funnel is several hops and any of them can silently
      lose someone. Weigh against the privacy policy, which is currently short and honest
      partly because there is no third-party analytics to disclose: a self-hosted counter or
      Vercel's own analytics keeps it that way, a third-party script means updating `/privacy`.

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
      `wishlist_items.notes` (`api/app/models/wishlist_item.py`, `max_length=1000` in
      `api/app/schemas/me.py`) with a 2-row textarea plus a "Save notes" button in
      `EditWishlistModal.tsx`. The `games` table has no notes column at all.<br>
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
      `EditWishlistModal.tsx` offers "I bought it, move to library" and the promote step
      just asks for a system (`WishlistPromote`), so the game arrives unrated: on its normal
      shelf, and under `groupBy: "rating"` in the "Unrated" group.
      Two premises are wrong: moving to the library means you _played_ it (which might be a
      current session or a past one), and a wishlist entry may be a game already in the
      library that you want to replay.<br>
      _Want:_ rename the button to "Played, move to the library" and show it **only** when the
      game is not already in the library. Either way, follow up with "Track a play session?".
      When the game is already in the library and the move button is hidden, offer "Track a
      play session?" straight away.<br>
      _The wiring:_ the modal only receives `item` and `existingSystems`
      (`EditWishlistModal.tsx`), so "is this already in the library?" needs the library
      names threaded in from `GameLibrary` (which has `games` in hand) — and matching by name
      alone will misfire across systems, so decide whether `igdb_id` is the key. Starting a
      session from here means reaching the same `logSession` path `EditGameModal` uses.
- [ ] **Make library and wishlist entries fully editable, and keep the two edit modals 1:1.**
      **Changing which console an entry records is now the urgent half of this**
      (2026-08-10). Since the catalog migration a library entry is unique on
      `(user_id, metadata_id)`, so adding a game you already own on a second console is a
      409 — and with `GameUpdate` still rating-only there is **no way out of that 409 at
      all**. Editing `system` is the escape hatch, and it is a small change on its own:
      `GameUpdate` gains `system`, a repo `update_game_system` mirroring
      `update_game_rating`, and a field in `EditGameModal`. Worth doing first even if the
      rest of this item waits.<br>
      Both sides are stuck today: `GameUpdate` (`api/app/schemas/me.py`) is
      **rating-only** by design ("future metadata edits extend this model"), so
      `EditGameModal` cannot touch system, or rating aside, anything else — the earlier
      framing that only the wishlist was limited was wrong. Note name, genres, release date
      and cover art now live on the **shared** `game_metadata` row, so editing those is a
      different and harder question than editing `system`: a shared row is visible to
      everyone who owns that game, and nothing in the UI edits one today by design. Editing
      metadata means deciding whether the edit forks a private row, is restricted to private
      rows, or genuinely changes the game for everyone. `EditWishlistModal`
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
      URLs would reopen exactly that, and the argument is stronger now that the field writes a
      shared row. Genre editing here also unblocks the genre-vocabulary backlog item below,
      which currently needs a one-off script for want of a write path.
- [ ] **Fold "+ Add to wishlist" into a single "+ Add game" that picks its destination.**
      `GameLibrary.tsx` swaps the button label by view, and `AddGameModal` already takes a
      `target: "library" | "wishlist"` prop (`AddGameModal.tsx`) that swaps the rating
      picker for a star checkbox and makes the system optional. So the modal can already do
      both: what is missing is a destination switcher (two tabs) inside it, defaulted to
      whichever view the button was clicked from.<br>
      _Watch:_ `target` currently changes required fields, so the switcher has to re-validate
      rather than just re-label — flipping from wishlist to library with an empty system must
      block submit, not silently post.
- [ ] **Make the view tabs and the add button sticky, like the filter bar.** The
      "Played" / "Want to Play" strip and the "+ Add game" / "Stats" row
      (`GameLibrary.tsx`) scroll away, while `FilterBar` sticks at
      `top-[var(--nav-height)]` (`FilterBar.tsx`).<br>
      _Not just adding `sticky`:_ the filter bar's offset is `--nav-height` exactly, so a
      sticky tab strip above it either overlaps or has to be part of the same sticky block,
      with the filter bar's `top` becoming nav height plus strip height. `FilterBar` also
      snapshots its document-relative top once in a `useLayoutEffect`
      (`FilterBar.tsx`) to drive the mobile hide-on-scroll-down behavior, and that
      measurement assumes nothing sticky sits above it. Simplest shape is probably one sticky
      container holding both, so they hide and show as a unit on mobile.
- [ ] **Owner edit affordances still pop in after hydration.** The pencils and "Add game" appear
      a beat after first paint on your own library, because the answer
      resolves in a `useEffect` — `useViewerRelationship`
      (`src/components/video_games/useViewerRelationship.ts`), read through `useIsOwner()` in
      `FollowControls.tsx`. **Premise updated 2026-08-07:** this used to name
      `useIsLibraryOwner` and a `/me/profile` fetch; that hook is deleted and the two per-viewer
      requests are now one (see Recently Completed). That halved the work but did not fix this —
      one round trip after hydration still lands after first paint. The symptom list also lost
      the Unrated shelf on 2026-08-07: unrated games are no longer `canEdit`-gated at all.<br>
      The pre-paint `data-authed` flag that fixed the CTA banner and `AuthButton`
      (2026-07-29, see Recently Completed) **cannot** be extended to cover this: the cookie proves
      a session exists but not whose it is, and the JWT's `sub` claim is a user id, not a
      username, so answering "is this viewer the owner of THIS library?" needs the
      `/me/relationship` round trip either way.<br>
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
- [ ] **Restrict the add-game "system" suggestions to the platforms the game actually released
      on.** Today `AddGameModal.tsx` builds the `<datalist>` as a _union_ —
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
      _New since 2026-08-05:_ the search rework built half of this. `_build_platform_aliases`
      (`api/app/services/igdb.py`) already turns IGDB's `/platforms` into normalized aliases
      ("nes", "snes", "switch 2"), cached per process. What is still missing is the other
      direction — alias → _your_ shelf label — so this becomes "match the shelf system whose
      normalized form hits the same alias" rather than a hand-written mapping table.<br>
      _New since 2026-08-10:_ **`game_metadata.platforms` is now where "the platforms this
      game released on" belongs**, and it is a fact about the game rather than something the
      client has to carry through from the IGDB search result. Two consequences. **(1)** The
      answer survives a page reload and works for a game already in the library, not only for
      one just picked from search. **(2)** The column is currently seeded from the consoles
      people actually recorded, not from IGDB, so it is not yet usable for this. Filling it
      is its own item — **"Backfill `game_metadata.platforms`"** in Up Next — which also owns
      the decision about whether the column stores IGDB's platform names or shelf labels;
      that decision is most of this item's normalization problem, so read it first. The
      column is also not on the read schema, so exposing it is the same widening the
      duplicate-add bug wants.<br>
      Same change applies to the promote form in `EditWishlistModal.tsx`, which today offers
      only existing shelf systems and no IGDB platforms at all (see the mobile field-suggestions
      item below, which covers the same form).
- [ ] Field suggestions (system, genre, …) should work on mobile, not just desktop — the
      add/promote forms use a native `<datalist>` (`AddGameModal.tsx`, `EditWishlistModal.tsx`),
      which mobile Safari/Chrome either render poorly or ignore, so on a phone the system
      field is a bare free-text input. Replace the datalist with a real combobox (controlled
      input + filtered dropdown list, keyboard + touch friendly) so suggestions appear on
      every device. Also make the suggestions game-specific: `AddGameModal` already merges
      IGDB's `draft.platforms` for the selected game into the shelf-system list, but the
      promote form in `EditWishlistModal` only offers existing shelf systems — thread the
      IGDB platforms through there too, and consider doing the same for genres.
- [ ] Library-level "create session" button (owner-only) — start or log a session for any game without opening that game's pencil/edit modal: a game picker (search the library) + the same start-now / past-dates form the modal has. Stretch goal: accept a game NOT in the library yet ("I just started something new") — the flow would add the game to the library (IGDB search, Phase 3 slice 4's proxy) and open its session in one go. Backend already supports everything except add+start-in-one; UI is the work. Keep simple, iterate later.
- [ ] Profile pictures for user accounts (instanced game libraries follow-up, post-v1 — likely Supabase Storage + upload/crop flow, shown in the library profile header and follower lists)
- [ ] Homepage customization per user (instanced game libraries follow-up, post-v1 — let users personalize their library page: hero/backdrop, shelf styling, featured games, etc. Scope TBD)
- [ ] Staging environment (instanced game libraries follow-up — the project deliberately accepted a "no staging" caveat: previews are read-only against prod, so writes first run for real in prod; revisit with a second Supabase project or branching once the write path exists). **Promoted in priority 2026-07-28:** the preview `500 MIDDLEWARE_INVOCATION_FAILED` (since fixed — see Recently Completed) was this caveat biting for real. Pointing Preview at production's Supabase is the stopgap, but it means preview sign-ins are production accounts. A second Supabase project (own DB + own GoTrue + own Google OAuth client) would give previews a real identity system and finally let the write path be exercised somewhere that isn't prod
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

- [x] **Games have their own table: metadata normalized into a shared catalog** (2026-08-10,
      branch `games_migration`). `game_metadata` holds the game (name, cover, genres, release
      date, `platforms`); `games` → `played_games` and `wishlist_items` → `wishlist_games`
      became link tables carrying only per-user facts. The wire shape is unchanged, so
      **`src/` needed zero edits** — verified by diffing `/users/rgrassian/games` before and
      after the migration.<br>
      _The systems-list half was reversed, on purpose (2026-08-10)._ The item asked for
      `systems: text[]` on an entry. Decided instead: **one system per entry**, with
      `UNIQUE (user_id, metadata_id)` making it one entry per game per user. Allowing two
      consoles later is a one-statement relaxation of that key to include `system` — no
      column add, no backfill. But the _migration_ is the cheap part and the _feature_ is
      not: two rows means two cases on the shelf until `pipeline.ts` groups them by
      `metadata_id`. The upside is that per-port ratings and sessions stay honest rather
      than being merged lossily.<br>
      _Catalog identity, which is what let this ship with no moderation story:_ a row with an
      `igdb_id` is shared; a row without one is private to whoever typed it in
      (`created_by_user_id`). Nothing in the UI edits a shared row. Written up in
      `api/README.md`.<br>
      _Premise correction worth keeping:_ the old entry called `igdb_id` "the planned backfill
      key". It was NULL on essentially every row — nothing had ever written it but the IGDB
      search flow. The answer was a throwaway script keying on the **cover image id already
      sitting in `image_url`**: `.../t_cover_big/{image_id}.jpg` carries IGDB's own
      `image_id`, and `/covers` maps it to a game id exactly. Every row in the frozen fixture
      (155 games, 29 wishlist) carries a cover, so this resolves the whole library with no
      fuzzy matching at all. The script ran against prod and was deleted afterwards; it is
      in git history if the technique is ever wanted again, and its captured platform lists
      survive as `api/scripts/.igdb_platforms.json` (see the platforms backfill in Up Next).<br>
      _Two gotchas for whoever touches this next._ **(1)** `backfill_titles.py` and
      `backfill_genres.py` now walk `game_metadata` (one row per game, not one per entry),
      and a shared row's genres are shared — fine for one curator, re-think before strangers.
      **(2)** `play_sessions.game_id` still points at the user's row and must keep doing so;
      the reasons are on the column and in `api/README.md`.

- [x] **The add-game form no longer pans sideways on a phone** (2026-08-09, branch
      `claude/mobile-modal-zoom`). Three changes, addressing two independent mechanisms.<br>
      _iOS auto-zoom on focus:_ mobile Safari zooms the page in when a form control under 16px
      takes focus and does not zoom back out, at which point the layout really is wider than the
      window and pans in both axes. `fieldClass` (`formStyles.ts`) is now
      `text-base pointer-fine:text-sm`, so touch devices get 16px and anything with a mouse keeps
      14px. Capability, not breakpoint: an iPad is wider than `sm` and still zooms. Deliberately not
      `maximum-scale=1`, which would disable pinch-zoom for everyone. Note this lands on the
      filter bar's search box and selects too, since they compose from the same token: same
      defect, one fix.<br>
      _Horizontal overflow:_ per CSS, when one axis of `overflow` is not `visible` the other
      computes from `visible` to `auto`, so the confirm body's `overflow-y-auto` made it
      horizontally scrollable the moment any child was a pixel too wide. Both scroll areas (the
      confirm body and the search step's results `<ul>`) are now `overflow-x-hidden
overscroll-contain`, and `labelClass` carries `min-w-0` so `input[type="date"]`'s intrinsic
      control width cannot push its flex parent wide in the first place. Review correction: the
      automatic minimum size applies on the flex MAIN axis only, so `min-w-0` is inert in the add
      form's `flex-col` and actually earns its place in `EditGameModal`'s `flex flex-wrap` row of
      date labels.<br>
      _Not verified on a device, and one half deliberately left undone._ If the page still moves
      under a finger, the remaining suspect is the scroll lock: `useModalChrome` sets
      `document.body.style.overflow = "hidden"`, which iOS Safari ignores for touch. The real fix
      there is `position: fixed` on the body with scroll-position save/restore, which is invasive
      enough to want its own change and affects all three dialogs sharing the hook.

- [x] **Library search folds accents** (2026-08-09, branch `claude/search-fold-accents`).
      Typing "pokemon" now finds "Pokémon", "okami" finds "Ōkami". `foldForSearch` in
      `pipeline.ts` runs `.normalize("NFD").replace(/\p{Diacritic}/gu, "")` over both the query
      and the name; `prepareBaseFilters` folds the query once per pass, so the per-game cost is
      one fold, not two.<br>
      _The half that is easy to miss:_ `passesBaseFilters` is not the only matcher.
      `collectAvailableGameFilters` and `collectAvailableWishlistFilters` each inline their own
      copy of the name check, for the single-pass reason documented on them, and a fold applied
      to only the first would have left the dropdowns disagreeing with the shelves about what an
      accented title matches.<br>
      _Deliberately not done:_ punctuation folding ("resident evil 4" matching "Resident Evil 4:
      Remake") and any edit-distance matching. The entry's "stay strict" constraint still holds,
      and the option is written up in the comment on `foldForSearch` if it is ever wanted.

- [x] **The mobile game-case flip no longer lags** (2026-08-09, branch
      `claude/mobile-flip-lag`, PR #98). **Confirmed fixed on a device by the owner**, which is
      what closes it: nothing here was reproducible in development.<br>
      _The fix that mattered was almost certainly the compositing head start._
      `will-change: transform` under `.game-case-scene:active .game-case-inner` promotes the case
      to its own layer during the press, before the click handler adds `.is-flipped` and the
      first `rotateY` would otherwise have to pay for the promotion mid-animation. Scoped to the
      pressed case: setting it on all ~155 at once is how you make the whole page slower. It
      covers the flip OUT only, since `:active` ends at release, so if the flip BACK ever feels
      slow that is why, and it needs a different mechanism rather than a wider selector.
      Promoting the flipped case instead was tried and dropped (holds a layer while nothing
      animates; de-promoting faces carrying `backface-visibility: hidden` as a transition starts
      is a known one-frame-flash source in WebKit).<br>
      _Two dead ends worth not re-deriving._ Hover emulation was the original prime suspect: iOS
      playing `.game-case-inner`'s `group-hover:` lift on first touch before the click fires,
      fixed by gating the lift behind `@media (hover: hover)`. **Tailwind v4 already emits every
      `hover:` and `group-hover:` utility inside that media query** (verified by compiling
      `group-hover:-translate-y-2` against the pinned version), so on a touch-only device the
      declarations do not exist and there is nothing to gate. Any future fix starting "wrap the
      hover styles in a media query" is a no-op. The 300ms tap delay was the other: Next's
      default viewport meta already drops it, and `touch-manipulation` shipped as a hedge.<br>
      _Also corrected in the same pass:_ the flip button's cursor special-case was
      `cursor-pointer sm:cursor-default`, a breakpoint test standing in for a capability one, so
      a desktop window dragged under 640px got a hand cursor. Now `pointer-fine:`.

- [x] **The add-game genre field stopped rewriting itself in front of you** (2026-08-09).
      Picking an IGDB result used to paint IGDB's genres immediately, then swap them for the
      Wikipedia/Wikidata answer a second later, sometimes captioned "Wikipedia had no match,
      showing IGDB's genres" even when the match had plainly worked. `GameDraftForm` now holds
      the field on a "finding genres..." placeholder until the lookup settles, and both status
      captions are gone: which source won is an implementation detail.<br>
      _Two things worth keeping._ The bogus caption came from reading a `let applied` that the
      `setDraft` updater assigns — React only runs that updater eagerly when the target fiber
      has no pending work, so the flag was read before it was written on some renders and not
      others. Never derive a second piece of state from inside an updater; that whole class of
      race went away with the caption. And the loading state is initialized from
      `lookupGenresFor` rather than to `false`, because effects run after paint and a `false`
      start paints one frame of exactly the flash it exists to prevent.<br>
      _An accepted trade-off:_ the field is `disabled` while loading, which is what lets the
      response be applied unconditionally instead of guarding on whether the user has typed
      since. The draft still carries IGDB's genres the whole time, so saving mid-lookup submits
      them rather than nothing.

- [x] **Account deletion shipped** (2026-08-08, branch `worktree-account-deletion`).
      `DELETE /api/py/me/account`, a control at `/video-games/account` reached from an
      "Account" link in the library header, and `/privacy` rewritten to point at it instead of
      email.<br>
      _Two things worth keeping._ The cascade root is `auth.users`, not `profiles` — the FK
      runs profiles → auth.users, so the service cannot `db.delete(profile)` and expect the
      auth user to follow; it calls the Admin API and lets the cascade run down. And
      `rate_limits` has no FK to `profiles` (deliberate, so it can cover pre-onboarding
      callers), so `rate_limit` repo's `delete_for_user` clears it by hand, after the Admin
      call so a 503 leaves the account whole.<br>
      _The trap that review caught._ A 404 from the Admin API is NOT proof the user is gone.
      That URL is concatenated from `SUPABASE_URL`, so a trailing slash or a stray `/auth/v1`
      404s with every row still in place, and the first version reported that as a 204.
      `delete_auth_user_or_raise` now returns a bool and the service confirms the deletion by
      re-reading the profile row (`me_repo`'s `profile_exists`, a fresh scalar count rather
      than `db.get`, whose identity map would answer from cache). Reproduced against local
      Supabase before and after. Nothing had ever depended on `SUPABASE_URL` being right
      before this, because its only other consumer logs failures and moves on.<br>
      _Two more things worth remembering._ The founder's account is undeletable
      (`FounderUndeletableError`, 403): the handle is in `RESERVED_USERNAMES` so signup could
      never reclaim it, `/video-games` would `notFound()` forever, and `opengraph-image.tsx`
      would fail the next production build. And once the Admin call succeeds nothing may report
      failure, so the `rate_limits` cleanup after it swallows `SQLAlchemyError` — a 500 there
      would tell someone their deletion failed while every row of theirs was already gone.

- [x] **Unrated games are first-class members of the library** (2026-08-07, branch
      `worktree-fix+unrated-shelf-filtering`). Closes two items at once: "Filtering should apply
      to the Unrated shelf too" and "Show the Unrated shelf to everyone, not just the owner".
      `LibraryPage.tsx` no longer splits the API's games on `rating !== ""` — one list goes to
      `GameLibrary` and through the one filter/group/sort pipeline, so the separate
      `unratedGames` prop and the `canEdit`-gated trailing `<ShelfSection label="Unrated">` are
      both gone.<br>
      _The product decisions taken, since both were genuinely open:_ unrated games **mix into
      their normal shelves** under groupBy system/genre/decade/none rather than staying a
      separate group in every mode; under `groupBy: "rating"` they land in the `"Unrated"` group
      `RATING_ORDER` had always pinned last but which no game could reach. Visitors see them
      (cases without pencils, via the shared `onEditGame={canEdit ? … : undefined}` every shelf
      already used). A currently-playing unrated game now appears on both the CRT and a shelf —
      accepted, since rated in-progress games always double-billed the same way.<br>
      _Worth knowing:_ the rating filter gained an "Unrated" option, which needed a filter-only
      `RatingFilter` type in `src/lib/games.ts` (`Rating | "Unrated" | ""`) kept deliberately
      distinct from `Game["rating"]` — `UNRATED_LABEL` is not a legal rating and must never reach
      `updateGameRating` or `RatingPicker`. `?rating` is now validated against that set instead
      of cast, so a junk value falls back to "all" rather than rendering an empty library.
      `playedCount` collapsed to `games.length`, and `StatsPanel`'s `queryableGames` merge became
      a no-op and was deleted.
- [x] **The two per-viewer API calls on a library page collapsed into one** (2026-08-07).
      `useIsLibraryOwner.ts` is deleted. Edit affordances now read `isMe` off the relationship
      response via a `useIsOwner()` selector exported from `FollowControls.tsx`, so one request
      answers both "am I following them?" and "may I edit this?" — `RelationshipRead` had
      carried `is_me` for exactly this since Phase 5.<br>
      _The blast radius was the provider, not the hook._ `FollowStateProvider` wrapped only the
      header, so it was hoisted in `LibraryPage.tsx` to wrap the whole `max-w-7xl` div and
      `GameLibrary` lost its `ownerUsername` prop, which existed only to feed the deleted hook.
      Widening the provider costs nothing across the server/client boundary: `children` is a
      serialized RSC slot rather than an import, so the server-rendered subtree ships no extra
      JS and React re-renders only the provider when the answer lands.<br>
      _The visible win beyond the round trip:_ the two answers used to resolve independently, so
      edit pencils could appear while the Follow button was still deciding. Now they cannot
      disagree.<br>
      _Still open:_ the pop-in item below. Edit controls resolve one request sooner but still in
      a `useEffect`, so they continue to appear a beat after first paint.
- [x] **Add-game IGDB search: more results, platform in the query, fuzzy fallback, better
      ranking** (2026-08-05). `SEARCH_LIMIT` 10 → 25 plus `offset` paging behind a "Show more
      results" button (`page` query param, capped at `MAX_PAGE = 4`; the click bypasses the
      debounce so one click is one charge against the `igdb_search` bucket). "star fox switch 2"
      now works: `/platforms` is fetched once per process and cached 12h into an alias map
      (name, abbreviation, alternative names, plus vendor-stripped "Nintendo Switch 2" →
      "switch 2"), the longest matching **suffix** is split off the query into
      `where platforms = (...)`, and a miss retries with the whole string as a title.<br>
      _Two rules that keep it from doing harm:_ an alias must contain a letter, or Nintendo 64's
      "64" would eat the tail of "Star Fox 64" and hide the 3DS remake; and a bare platform
      name ("switch") stays a title search since nothing would be left to search for.<br>
      _"Civ 6":_ when the name search returns nothing, one fallback query substring-matches
      `name` and `alternative_names.name` — first page only, since paging past a fallback would
      splice two differently-ordered result sets together.<br>
      _Ranking:_ results are re-sorted by IGDB's `game_type` (stable, so relevance order
      survives inside a tier), which is what puts _Pokémon FireRed Version_ (Remake) above
      _Pokémon Fire Red Extended_ (Mod).<br>
      _Left for the "restrict the add-game system suggestions" item:_ the alias map is
      IGDB-name → IGDB-id, not IGDB-name → shelf label, so it does not by itself solve the
      "Nintendo Entertainment System" vs "NES" mapping that item needs — but it is the obvious
      place to hang it.
- [x] **Both backfills run against production** (2026-08-05, PR #81). Titles then genres, on
      the library and the wishlist, verified on the live site. Procedure kept in
      `docs/genre-backfill-runbook.md` if it is ever needed again.<br>
      _The ordering was the whole point:_ renaming the informal titles first took the genre plan
      from 118 auto / 36 needing review to **183 auto / 0**. Two rows were not merely uncertain
      but silently wrong from the informal name ("Call of Duty Black Ops 2" resolved to _Black
      Ops 7_), so titles-first removed a class of wrong answers, not just review work.<br>
      _Reviewing the prod plan caught things local never hit_, which is the argument for reading
      a plan rather than trusting a green run: "Plants vs. Zombies" matched the **franchise**
      article and picked up Garden Warfare's and Heroes' genres, and "Kinect Adventures" matched
      "Kinect: Disneyland Adventures". Both are now in `OVERRIDES`.<br>
      _The step most easily forgotten_ is flushing the cache: the scripts write straight to
      Postgres, so `revalidateTag` never fires and prod serves stale pages until an owner write
      happens in the UI. Rating a game and undoing it is enough.

- [x] **Titles backfilled to canonical names, then genres re-sourced** (2026-08-03, local DB
      only). 54 renames, then 22 genre rows. The ordering was the point: doing titles first took
      the genre plan from **118 auto / 36 needing review to 154 auto / 0**.<br>
      **`backfill_titles.py` is a hardcoded map on purpose.** The first version resolved every
      title against IGDB and scored the candidates; it could not tell a canonical title from an
      edition or spin-off whose name merely extends it, proposing "Elden Ring" -> _Elden Ring
      Nightreign_, "Halo CE" -> _Halo CE+_, "Dead Cells" -> _Dead Cells+_. Every result needed
      reading anyway, so the map is that reading done once — auditable, and it cannot drift.
      Preview is the default, so a prod run is always a select before an update.<br>
      _A real parser bug surfaced in the re-run:_ an infobox `genre` that is the template's LAST
      parameter swallowed the article prose after it, so Majora's Mask picked up Japanese title
      text and "and quality of life changes" as genres. The field now stops at `}}` as well as
      at the next parameter. This one mattered beyond the backfill — it is the live add-game
      lookup.<br>
      _"Cadence of Hyrule" is deliberately NOT renamed_ to its full canonical title. IGDB is
      right that it is the formal name, but the longer string then matched the Wikipedia article
      "The Legend of Zelda" (its words are a subset) and took that game's genres.<br>
      _Seed fixtures were renamed in lockstep_, so `seed.py` reproduces the canonical library;
      `sessions.csv` references games by name and would otherwise attach sessions to nothing.<br>
      _Verified by a review agent against the live DB:_ 155 games, no duplicates, no empty genre
      lists, 44 distinct genres with no case/spelling collisions, and no junk values. It caught
      two things since fixed: "Role-Playing" on Untitled Goose Game, and a
      "Monster Tamer"/"Monster-taming" split that would have shown as two filter options.

- [x] **Genres re-sourced from Wikipedia, and the add flow wired to the same source**
      (2026-07-30). Replaces the original plan, which had it backwards: it said to normalize
      onto _IGDB's_ vocabulary, but IGDB's `genres` field is too coarse to describe a library
      (Hades II as "Role-playing (RPG), Hack and slash, Adventure, Indie", no roguelike). Built
      `api/app/services/genres.py`, `GET /api/py/genres/lookup` (own `genre_lookup` rate-limit
      bucket), the add-game modal calling it on IGDB pick with IGDB genres as the fallback,
      `api/scripts/backfill_genres.py`, and the `clean_genres` case/duplicate dedupe. Suite
      175 -> 285.<br>
      **Wikidata `P136` was tried first and rejected**, which is the thing worth remembering.
      It is structured and batchable, so it looks like the obvious choice, but it is frequently
      thin or wrong: Kinect Sports "association football video game", Zelda: The Minish Cap
      "role-playing video game", Dance Central "music video game". The Wikipedia
      `{{Infobox video game}}` genre field says Sports, Action-adventure, Rhythm — correct, and
      already the library's vocabulary, because the original genres were read off those same
      infoboxes by hand. Switching sources took the backfill from 65 changed rows to 42 and
      auto-matches from 89 to 118; _fewer_ changes was the signal the source was right. P136
      survives only as a fallback when an infobox has no genre field.<br>
      _Two matching bugs the design exists to prevent, both real:_ searching "Zelda: Twilight
      Princess" ranks the **manga** first (genres "adventure anime and manga"), so a candidate
      must carry `{{Infobox video game}}`; and taking the first _game_ hit resolved "Hades II"
      to **Hades** and "Animal Well" to **Animal Crossing**, so survivors are ranked by title
      similarity. Also: Wikimedia 429s generic User-Agents, and title similarity is a bad
      confidence signal (0.895 "Octopath Traveller"->"Octopath Traveler II" is wrong, 0.538
      "Halo CE"->"Halo: Combat Evolved" is right), hence auto-accept only at ~0.97.<br>
      _A code review caught two more before anything was written:_ `--apply` had no `user_id`
      filter and would have rewritten **every** user's genres, and the confidently-matched tier
      was never shown to a human despite being where the real damage was (55 of 68 rows dropped
      a curated genre). Both fixed; `--review` now walks every changing row.<br>
      _Deliberately no alias map_ (asked twice): the library takes the source's spelling, so
      `RPG -> Role-Playing` and `Racing -> Kart Racing`. Only spelling-level variants snap to
      existing terms, which is what keeps case-only duplicates out of the filter dropdown.

- [x] **Fixed the gap above the "Unrated" shelf** (2026-07-30, `GameLibrary.tsx`). The grouped
      shelves carried `pb-24` while the Unrated shelf rendered outside that wrapper, so the
      6rem of trailing space landed _between_ the two groups. Both groups now sit inside one
      `pb-24` container and the inner block keeps only `mt-6`.<br>
      _Worth knowing:_ `ShelfSection` supplies its own `mt-10`, so Unrated never needed spacing
      of its own — deleting the padding outright would have fixed the gap and reintroduced the
      problem `pb-24` exists to solve (the last shelf jammed against the viewport bottom).

- [x] **Browser pass on the Phase 5 UI** (2026-07-30) — the client-rendered surfaces no test
      reaches: the follow toggle, its absence on your own library and when signed out, "Back to
      my library", the Following/Followers tabs and their links, `?view=followers` deep-links,
      and both users' counts agreeing after a follow (the two-tag revalidation). Clean, no
      defects found.<br>
      Worth knowing the two real bugs were caught by a code review **before** this pass, not by
      it: following while signed in but not onboarded 500'd, and signup's auto-follow never
      purged the founder's cache tag. Both were invisible to a green suite and to casual
      clicking — the first needed an abandoned onboarding, the second a stale page nobody would
      think to reload. See the Phase 5 entry below.
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
      Both now fixed and tested. Lesson, now recorded in `api/README.md`: any write that creates a follow edge
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
      the owner check still needs a round trip after hydration. Own backlog item now. (That check
      was `useIsLibraryOwner` + `/me/profile` when this was written; since 2026-08-07 it is
      `useViewerRelationship` + `/me/relationship`, one request instead of two — the reasoning
      here is unchanged.)<br>
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
