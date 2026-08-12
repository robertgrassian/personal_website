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

- [ ] **Take a pass at the catalog rows whose `igdb_id` points at a variant, not the base
      game.** (Promoted by request 2026-08-10.) Eleven on prod, surfaced by
      `backfill_platforms.py`'s guard: it skips any row where a console someone actually owns
      the game on is absent from IGDB's platform list, which is strong evidence the row was
      identified as the wrong IGDB entry. `Dead Cells` resolves to IGDB's **Dead Cells+**
      (Apple Arcade, iOS only), `Super Mario 64` to the 3D All-Stars entry, `Luigi's Mansion`
      to the 3DS remake, `Super Smash Bros. Brawl` to a Web browser entry, `Metroid Dread` to
      a PC one. The rest: Call of Duty: Black Ops III, Disco Elysium, Grim Fandango, Hollow
      Knight, Pac-Man World 2, SpongeBob SquarePants: Lights, Camera, Pants!.<br>
      _It is not only platforms, which is the part that is easy to miss._ The whole
      `game_metadata` row is the variant's, so its genres, cover art and release date come
      from there too. Only the **name** was protected: `KEEP_STORED` in the since-deleted
      `backfill_igdb_ids.py` stopped those titles being renamed to the variant's, and left the
      id underneath alone.<br>
      _The latent multi-user problem, which is the real reason to fix it._ Another user adding
      one of these through IGDB search resolves the **base game's** id, which is a different
      `game_metadata` row, so one game ends up with two catalog rows and the sharing the
      catalog exists for silently stops happening for exactly these titles.<br>
      _Read each one; some are IGDB being wrong rather than the id._ Pac-Man World 2 really
      did release on GameCube and IGDB lists only PlayStation 2, so its id is right and there
      is nothing to repoint. The guard cannot tell those two cases apart, which is why it
      skips rather than guesses.<br>
      _Fix shape:_ find the base game's `igdb_id`, then **repoint the link rows'
      `metadata_id`** at the correct catalog row rather than editing `igdb_id` in place.
      Editing in place can collide with `uq_game_metadata_igdb_id` if a row for the correct id
      already exists, and repointing is the merge operation the catalog was designed for: it
      touches no play session, because `play_sessions.game_id` points at the user's row.
      Re-run `backfill_platforms.py` afterwards and the skip list should shrink to the genuine
      IGDB gaps.

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

## Bugs

_Confirmed defects that are not urgent enough for Up Next. Roughly severity-ordered, worst first.
Promote one into Up Next when it starts blocking the sharing goal above, and demote something else
to keep that section at five._

- [ ] **The genres, release date and cover art you edit while adding a game are silently
      discarded whenever someone else already added that IGDB game.** Found in the code review of
      this branch (2026-08-12), confirmed by reading `find_or_create_metadata`
      (`api/app/repositories/me.py`): it returns an existing catalog row **untouched**, so every
      field the caller passed is dropped on the floor. The add form still offers those fields
      (`GameDraftForm`), the API still answers 201, and the game still lands on the shelf — with
      somebody else's metadata. Nothing tells you, which is what makes it worse than a rejection.
      Today it needs a second user to bite; it becomes ordinary the moment there are any.<br>
      _Why it is not simply a bug in that function._ The row is SHARED by design: one
      `game_metadata` per IGDB id, which is the whole point of the catalog migration. Honouring
      the caller's edits would rewrite the game for everyone who owns it, which is exactly the
      thing `api/README.md` records as deliberately not possible from the UI. So this is a product
      decision wearing a bug's clothes, and the honest options differ in cost, not in
      correctness:<br>
      **(a)** Say so in the form: once a pick resolves to a catalog row that exists, show its
      metadata read-only with a note, so nothing is offered that cannot be saved. Cheapest, and it
      makes the current behaviour honest rather than changing it.<br>
      **(b)** Fork a private row when the caller's values differ, which loses catalog sharing for
      exactly the games people care enough to edit.<br>
      **(c)** Let the edit change the shared row for everyone, which needs an answer to "who owns
      a catalog row" that nothing in the codebase has yet.<br>
      _Decide this with the two items it is the same question as:_ **"Anyone can define a shared
      catalog row for everyone"** below (the write path trusting client metadata) and **"Make
      library and wishlist entries fully editable"** in Backlog (which already names forking vs
      restricting vs changing-for-everyone as the open choice). Answering one in isolation will
      pre-commit the other two.

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

- [ ] **A dropdown change mid-search can put back a character you already typed past.** Raised
      by the code review of this branch (2026-08-12) and **not reproduced** — read the mechanism
      below and confirm before fixing, because this is the same bug that
      `pushedSearchValues` in `useGameLibraryUrlState` was built to kill, and the comment on that
      ref is a good record of what has already been tried.<br>
      _The mechanism, from reading the code._ There are **two** writers of `?search` and only one
      of them registers what it wrote. The debounced search effect adds its value to
      `pushedSearchValues` before calling `router.replace`. But `updateParam` — every dropdown,
      via `paramsWithLiveSearch()` — also writes the live search value into the URL, and adds
      nothing to the set. So changing a dropdown while a search push is still in flight produces
      an echo carrying the same string, which `pushedSearchValues.current.delete(fromUrl)`
      consumes as if it were the search effect's own. When the real echo lands a moment later the
      set is already empty, so it is read as an external navigation and written back over the
      input — putting back the string as it stood before the last keystrokes.<br>
      _What this means for the fix._ The review's suggestion was a per-push counter, but the
      existing comment argues against a count for a good reason: a coalesced transition that never
      echoes drains it wrong and starts swallowing real navigations **forever**, where matching on
      value is self-correcting. The likelier fix is to make the second writer register too, so
      `updateParam` accounts for the `?search` it carries. Confirm the interleaving first: it
      needs a dropdown change inside the 300ms debounce plus a transition, which is a narrow
      window and may be why nobody has hit it.

- [ ] **An unwell library API makes the account page unreachable, and account deletion with
      it.** Found in the code review of this branch (2026-08-12). `AccountPage`
      (`src/app/video-games/account/page.tsx`) awaits `fetchMyProfile()` unguarded, and that
      function throws on an unreachable hop and on any status that is not 404 or 0
      (`src/lib/meApi.ts`), so a timeout or a 500 errors the whole route.<br>
      _What makes this a clear call rather than a judgement one:_ the two reads immediately below
      it, `getGames` and `getWishlist`, are already `.catch(() => null)`-guarded, and the comment
      explaining why says exactly this — that throwing "would error the whole page and make the
      delete control unreachable exactly when the site is misbehaving, the moment someone is most
      likely to want it". The reasoning was written down and then not applied one line
      above.<br>
      _It is close to a one-liner._ `AccountPanel` already takes `username: string | null` and
      substitutes the word "delete" as the confirm phrase when it is null, so the degraded page
      works today. What wants deciding is whether a null username there should say something
      ("we could not load your account details") rather than quietly presenting a weaker confirm
      prompt, since the prompt's whole job is to force a moment of comprehension.

- [ ] **Field suggestions (system, genre, …) should work on mobile, not just desktop.** The
      add/promote forms use a native `<datalist>` (`AddGameModal.tsx`, `EditWishlistModal.tsx`),
      which mobile Safari/Chrome either render poorly or ignore, so on a phone the system
      field is a bare free-text input. Replace the datalist with a real combobox (controlled
      input + filtered dropdown list, keyboard + touch friendly) so suggestions appear on
      every device. Also make the suggestions game-specific: `AddGameModal` already merges
      IGDB's `draft.platforms` for the selected game into the shelf-system list, but the
      promote form in `EditWishlistModal` only offers existing shelf systems — thread the
      IGDB platforms through there too, and consider doing the same for genres.

- [ ] **You can add a game you already have in your library. Reject a duplicate add
      server-side, and decide what "duplicate" means.** Reported 2026-08-08. **Mostly closed
      2026-08-10 by the catalog migration** — kept open only for the follow-up in the last
      paragraph. `create_my_game` now resolves the game to a `game_metadata` row and checks
      `find_game_by_metadata`, with `UNIQUE (user_id, metadata_id)` as the concurrency
      backstop, so a duplicate add is a 409 whatever console it names. "What duplicate means"
      was answered by the identity rule: same `igdb_id`, or same name among that user's own
      hand-entered games.<br>
      _The escape hatch shipped 2026-08-11_ (see Recently Completed): `PATCH /me/games/{id}`
      takes `system`, so "I own this on SNES and just got the DS version" is an edit rather
      than a dead end. This item stays open only for the annotation mismatch in the last
      paragraph, which is a cosmetic looseness rather than a dead end.<br>
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
      (2026-07-29; an inline script in `src/app/layout.tsx` stamps it from the session cookie,
      logic in `src/lib/authFlag.ts`) **cannot** be extended to cover this: the cookie proves
      a session exists but not whose it is, and the JWT's `sub` claim is a user id, not a
      username, so answering "is this viewer the owner of THIS library?" needs the
      `/me/relationship` round trip either way.<br>
      _Options, none free:_ have the API return the username in a separate readable cookie at
      sign-in (cheap, but adds a second source of truth for identity that can go stale after a
      rename); or accept the pop-in and make it less jarring by reserving space so nothing
      shifts. Lower priority than the two already fixed: this one only affects a viewer looking
      at their own library, who is about to interact with the page anyway.

## Backlog / Ideas

- [ ] **Detect where the title sits on a game cover, and crop the CRT picture so it is not cut
      off.** The TV screen is landscape and cover art is portrait, so `object-cover` throws away
      most of the height. Today every game gets the **same** hardcoded crop:
      `object-cover [object-position:center_22%]` on the `<Image>` inside `.crt-picture`
      (`src/components/crt/CrtTv.tsx` — corrected 2026-08-11: this entry used to name
      `video_games/CurrentlyPlaying.tsx`, which is dead code nothing imports. The same crop
      literal appears in both files, so edit the `crt/` one). 22% is a guess that titles sit
      high; when they don't, the title is sliced.<br>
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
      (`max_games` on `Settings` in `api/app/core/config.py` — default 2000, env-overridable,
      enforced in `api/app/services/me.py` on both create paths with a dedicated 403 — bounds
      rows, but nothing bounds edits); and whether undo is an affordance with a
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
      _The non-optional `Game.id` / `sessionCount` / `openSessionId` follow-up shipped
      2026-08-11_ and is in Recently Completed; only the four backend items above are left here.

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
      transform. The mobile flip-lag bug was about this exact element and **shipped 2026-08-08**
      (see Recently Completed), so this no longer has to wait on it — but read that entry first,
      because the fix that worked was a `will-change: transform` compositing head start scoped to
      the pressed case, and a new animation on the same element can undo it.<br>
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
      crawling follower lists. Deliberately skipped once already, when the route moved under
      `/video-games/u/` (2026-07-29): the sitemap already lists `/video-games`, which **is**
      Robert's library, so adding `/video-games/u/rgrassian` would have submitted two URLs for
      identical content, and a canonical link is the fix for that rather than a sitemap entry.
      With real signups that reasoning inverts: the entry becomes a generated list.
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
      all**. **That half shipped 2026-08-11** — see Recently Completed — so the 409 now has
      an escape hatch and this item is back to being the broader "edit everything" want.<br>
      `GameUpdate` (`api/app/schemas/me.py`) now carries rating and system, and nothing
      else; `EditGameModal` has a system field with an explicit Save. Note name, genres,
      release date
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
      _Work:_ extend `GameUpdate` past rating and system, following the same
      router → service → repository path `update_game_system` took, extend `WishlistUpdate`
      past starred/notes/system,
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
      one just picked from search. **(2)** The column is now populated from IGDB
      (2026-08-10), so this item's blocker has cleared.<br>
      _And the normalization problem this item was mostly about has largely gone with it._
      `played_games.system` now stores IGDB's platform names too (migration `d1a83f6c25e7`),
      so "is this system one the game released on?" is a set membership test rather than a
      fuzzy match, and no alias table is needed. What remains is display: `systemLabel` in
      `src/lib/games.ts` maps IGDB's uglier names for rendering, so suggestions should offer
      the stored name and show the label. The column is still not on the read schema, so
      exposing it is the same widening the duplicate-add bug wants — that is now the bulk of
      the work here.<br>
      Same change applies to the promote form in `EditWishlistModal.tsx`, which today offers
      only existing shelf systems and no IGDB platforms at all (see the mobile field-suggestions
      item in Bugs, which covers the same form).
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

- [x] **Filtering no longer strands the results under the sticky chrome** (2026-08-12).
      `useKeepResultsInView` (`src/components/video_games/`) scrolls the results back below the
      nav and filter bar when the visitor narrows the library differently. Fires only on a
      filter change, only upward, and through `window.scrollTo` so focus and the keyboard are
      untouched. Built from the DEFERRED filter values, so it does not fight a typist.
      **Confirmed on a device by the owner** (2026-08-12), which is what closes it: the
      keyboard half was never reproducible in development.<br>
      _Key it on the filters, never on the shelves that came back._ The first version used shelf
      labels and counts, which looks equivalent and is not: an owner edit changes the counts too,
      so rating a game while scrolled deep would scroll the page out from under you, and under
      `groupBy=rating` the game moves shelves as well. That is the yank the hook exists to
      prevent, arriving from the one direction the output cannot tell apart from a filter change.
      Caught in review, not in testing. `sortOrder` and `groupBy` stay out for the same reason a
      re-sort always did: neither narrows anything, so neither can strand the results.<br>
      _The premise correction held up:_ the shelves are in normal flow after the sticky bar and
      were never painted behind it. This was a scroll-position bug, and a z-index or padding
      change would not have touched it. What actually happens is that filtering collapses the
      document, the browser clamps `scrollY` to the new maximum, and nothing ever scrolled
      afterward.<br>
      _Two measurement details worth keeping._ How much room to clear is measured rather than
      restated: the bar's own sticky `top` resolves `--nav-height` to pixels, so
      `stickyTop + offsetHeight` is the exact chrome height, and `offsetHeight` rather than
      `getBoundingClientRect()` keeps the bar's hide-on-scroll transform out of the number.
      `visualViewport.offsetTop` is folded into the target for when a software keyboard has
      pushed the visible band away from the layout viewport that `position: sticky` resolves
      against.<br>
      _Instant, not smooth, and this is the part that surprised._ Smooth scrolling earns its
      cost carrying you through content that stays put; here the results were just replaced, so
      it animates through a list that no longer exists. It also restarts on every keystroke, runs
      to thousands of pixels, and can be stranded mid-flight by a thumb or by the keyboard
      resizing the viewport. Switching to instant took the residual failures from 12 to 0, so it
      was a correctness change, not a stylistic one.<br>
      _How it was measured, since this bug class had burned two wrong fixes before._ Driven in
      Chromium against the real page with 155 fixture games behind a stub API, over 96
      phone-shaped configurations of viewport, scroll depth and search breadth: **63 broken
      before, 0 after**. It reproduced worst at short viewport heights, which is the keyboard
      case, but also at full phone height with no keyboard, so it was never purely a keyboard
      problem.<br>
      _Emulating the keyboard as a short viewport turned out to be a good enough proxy_, which is
      the reusable lesson: Playwright has no software keyboard, so 390x400 stood in for one, and
      the device check afterwards agreed with it. Worth reaching for again on the next mobile
      layout bug, since it made a bug that "only happens on a phone" reproducible in CI-shaped
      tooling. Still not a substitute for the device check, which is what actually closed this.

- [x] **`--subtle` now clears WCAG AA in both color schemes** (2026-08-12). Light was 2.5:1 and
      dark 4.1:1, against a 4.5:1 minimum for normal text. Dark was also literally darker than
      light, which is backwards for muted text on a dark ground and was the original mistake.
      Now `--subtle` is gray-500 in light (4.8:1) and a hand-picked step between gray-500 and
      gray-400 in dark (5.5:1).<br>
      _`--muted` moved too, and that is the part worth remembering._ Passing AA put `--subtle`
      at roughly where `--muted` already sat, which would have collapsed two tokens onto one
      color. So `--muted` went gray-500 → gray-600 in light mode to reopen the gap. Only its
      contrast went up, so nothing it styles got harder to read; dark-mode `--muted` was already
      fine at 7.8:1 and did not move.<br>
      _Verified by walking the rendered pages, not by reading hex values._ A Playwright pass over
      `/about`, `/privacy`, `/video-games/start`, `/resume` and `/onboarding` in both schemes
      checked every text node against the background actually painted behind it, and all pass.
      Two traps in writing that check, if it is ever rebuilt: Tailwind v4 emits `oklab(... / 0.9)`
      for alpha-modified colors like the nav's `bg-background/90`, so a regex over the digits
      reads it as near-black (paint the layers onto a canvas and let the browser blend); and
      elements carrying `transition-colors` sample mid-animation if you mutate tokens at runtime.<br>
      _The landing-page workaround was left in place._ `/video-games/start` moved its body copy to
      `text-foreground` when this bug was found; the lead paragraph is the page's pitch and wants
      full contrast on its own merits, so only the stale comment explaining it was corrected.

- [x] **Removed the Wikipedia/Wikidata genre lookup from the add-game flow** (2026-08-12).
      The confirm step now shows IGDB's own genres, editable, and posts them; nothing is fetched
      between picking a game and saving it. Gone with it: `GET /api/py/genres/lookup`, its router
      and schema, the `genre_lookup` rate-limit bucket and `lookup_for_user`, `lookupGenres` in
      `meApi.ts` (and its 15s `TIMEOUT_MS.genres`), the `lookupGameGenres` Server Action, and the
      sequence-counter effect plus 12s client deadline in `GameDraftForm`.<br>
      _What survives, and why the vocabulary does not regress:_ `api/app/services/genres.py` keeps
      its Wikipedia client and `normalize_genres`, because `scripts/backfill_genres.py` is the real
      consumer and is the better place for this work anyway. A genre pass is a batch job over the
      whole library, not something worth paying for one game at a time while the owner waits.<br>
      _The latency this removed was the point._ Save was disabled for the whole lookup, so every
      add waited on two third-party services (Wikipedia, then Wikidata) before it could be
      submitted, and the genres field sat read-only showing a placeholder. IGDB's genres are
      coarser (no roguelike on Hades II), which is the accepted trade: the field is now editable
      from the first frame, so typing the right genre is faster than the lookup ever was.

- [x] **You can change which console a library entry records** (2026-08-11). `GameUpdate` gains
      `system`, `update_game_system` in `api/app/repositories/me.py` mirrors
      `update_game_rating`, and `EditGameModal` has a System field. This is the escape hatch the
      duplicate-add 409 had been missing since the catalog migration: the library is keyed on
      `(user_id, metadata_id)`, so a second console cannot be a second add and has to be an
      edit.<br>
      _The asymmetry with rating, which is the thing to know before extending this._ Rating has
      a cleared state and `""`/`null` both mean "unrate". System does **not**:
      `played_games.system` is NOT NULL, so blank and null are both 422s and omitting the key is
      the only way to say "leave unchanged". Tests cover all three spellings.<br>
      _The UI deliberately does not follow the rating picker's instant write._ A rating is one
      click of five known values; a system is free text mid-typing, and writing per keystroke
      would file a game under "S", then "SN", then "SNE". So it is a draft plus a "Save system"
      button that appears only when dirty, the shape the wishlist notes field already uses. It
      is also a third `<datalist>`, joining the add and promote forms, so the mobile-combobox
      item in Bugs now has three call sites to fix rather than two.<br>
      _Still deliberately out:_ name, genres, cover and release date. Those live on the shared
      `game_metadata` row, so editing one changes the game for everyone who owns it. `system` is
      per-user and carries none of that question.

- [x] **The library's row ids and session counts are non-optional** (2026-08-11). `Game.id`,
      `Game.sessionCount`, `Game.openSessionId`, `WishlistGame.id` and `GameCaseInput.id` all
      dropped their `?`. The API has always declared them required (`GameRead` /
      `WishlistGameRead`, `api/app/schemas/users.py`) and games only ever arrive from those
      endpoints, so the optionality bought nothing and cost eight `if (id === undefined) return`
      guards that could not fire. Those are gone, along with `GameCase`'s
      `game.id !== undefined` half of its `editable` test and `GameLibrary`'s `game.id ?? null`.
      Split out of the tier-3 refactor item in Backlog, which had it as the "now unblocked, and
      cheap" follow-up.<br>
      _One guard is NOT dead and was kept:_ `openSessionId` is `number | null`, where `null` is
      the real "not playing" value. `EditGameModal`'s `stopPlaying` still checks it, and the
      test tightened from `== null` to `=== null` now that `undefined` is off the table.

- [x] **Sort by rating** (2026-08-11). `rating-best` / `rating-worst` on the played view only,
      rendered as "Rating: Best" / "Rating: Worst". Grouping by rating withdraws both options,
      which is what the entry asked for, and it is worth knowing that **`groupBy: "rating"` is the
      played view's default** — so the new sorts are invisible until you group by something
      else.<br>
      _The validation is in two places, and both are needed._ `validSortOrderFor(view, groupBy)`
      in `libraryConfig.ts` narrows the menu, and the hook validates `?sortOrder` against that
      narrowed list rather than `config.validSortOrder`, so an inbound URL falls back instead of
      selecting a `<option>` that is not rendered (which shows a blank `<select>`). `setGroupBy`
      also had to stop being a plain `updateParam` call: it now strips a rating sort on the way
      into `groupBy=rating`, the same leak `setView` already cleaned up one param over.<br>
      _One product decision taken:_ unrated games sort **last in both directions**, rather than
      leading the "worst first" shelf. No rating is the absence of a rank, not the worst one.
      Ties break by name, because five ratings over 155 games means nearly every comparison is a
      tie and the residual order would otherwise be whatever the API happened to send.

- [x] **`CLAUDE.md` and `README.md` rewritten, with a Mermaid architecture diagram**
      (2026-08-11). New `docs/architecture.md` carries the request-flow diagram and is now
      **canonical for the request flow**; `README.md` owns what the project is and how to run
      it; `api/README.md` keeps the backend layer map and data model; `CLAUDE.md` keeps
      conventions plus a task → file map. Both files state that split so the same fact stops
      being written in four places. `CLAUDE.md` went 88 → 106 lines, inside the "roughly
      double" budget.<br>
      _Premise correction, and it inverts what this item claimed._ The entry said `CrtTv.tsx`
      was the wrong name and `CurrentlyPlaying.tsx` the right one. It is the other way round:
      `src/components/crt/CrtTv.tsx` has been the live component since 2026-07-21 (PR #59) and
      is what `LibraryPage` and `/currently-playing` import. `video_games/CurrentlyPlaying.tsx`
      is **dead code** that nothing imports, and is still being mechanically updated by
      refactors (PR #107 touched it). Deleting it is not tracked anywhere; the CRT-crop item in
      Backlog was repointed at the live file. The other two wrong facts were real: no
      `gamesServer.ts` exists (`libraryApi.ts` holds the `server-only` import), and the skill is
      `proj-todo`, not `todo`.<br>
      _Also fixed in passing:_ `docs/dev-setup.md` still advertised the retired CSV fallback
      ("unset `LIBRARY_API_ORIGIN` to fall back to the repo-root CSV files") and pointed at
      repo-root CSVs that now live in `api/scripts/fixtures/`.<br>
      _Worth reusing:_ the Mermaid block was validated by actually rendering it headlessly
      (`mermaid.parse` + `render` in Playwright Chromium at
      `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) rather than eyeballed, which is
      also how a subgraph title colliding with the incoming arrows got caught. A long
      `subgraph` title is what causes that collision; keep them short.

- [x] **`game_metadata.platforms` backfilled from IGDB** (2026-08-10, PRs #107 and #109).
      The catalog migration had seeded it from `played_games.system`, so it held "the one
      console someone recorded" rather than "every platform this released on": 20 rows empty,
      157 with exactly one, none with more. Now 0 empty and 113 with real multi-platform
      lists.<br>
      `api/scripts/backfill_platforms.py` is **re-runnable and keeps no state** — the ids come
      from `game_metadata.igdb_id`, so it asks IGDB directly. Run it whenever new games have
      been added. It stores IGDB's platform names verbatim; `systemLabel` in
      `src/lib/games.ts` maps the ugly ones for display only.<br>
      _The guard worth knowing about:_ it SKIPS any game recorded on a console IGDB does not
      list for it, because writing that list would remove the console its owner actually plays
      on. Caught on the production preview, where 11 rows would otherwise have been made
      actively wrong (Dead Cells to iOS-only). Those rows are the subject of the variant-id
      item in Up Next.

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
      survive as `api/scripts/.igdb_platforms.json`, though nothing needs them now: the
      platforms backfill reads ids straight from `game_metadata.igdb_id` instead.<br>
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
      _Still open:_ the pop-in item in Bugs. Edit controls resolve one request sooner but still in
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
