# Recently Completed

Archive of finished work, split out of the root [`TODO.md`](../../TODO.md) on 2026-08-15 so the
backlog index stays cheap to read. Newest first, capped at 20: drop the oldest when adding past
that. Entries are kept for the reference material they carry (a debugging gotcha, an accepted
trade-off, a follow-up someone will need), not as a changelog.

- [x] **Rating edits need a Save press, and every draft-then-save commit shares one filled
      button** (2026-08-15, branch `claude/game-rating-edit-confirm-x7u80j`). Closes "Editing a
      game should need a Confirm press". `RatingPicker`'s `onPick` in `EditGameModal` now sets
      `ratingDraft` and nothing else; a `Save rating` / `Cancel` pair appears while the draft
      differs from `game.rating`. "Remove rating" clears the draft rather than writing, so
      removing is the same two-step as changing.<br>
      _`useOptimistic` is gone from that component, on purpose._ The draft already shows the
      picked value while the write is in flight, and the hook's automatic revert is the wrong
      behaviour once a Save exists: a failed write now leaves the draft dirty so the button is
      still there to retry, instead of silently discarding a deliberate pick.<br>
      _What was deliberately not gated:_ start/stop playing. One labeled button is not the
      five-target grid this was about, and `stopSession` applies its rating **atomically with
      closing the session** server-side, which a per-field confirm would split into two writes.
      That was the open question the old entry named; this is the answer, not an oversight.<br>
      _The shared button is a class recipe, not a component._ `saveButtonClass` in
      `formStyles.ts`, used by Save rating, Save system, the past-session Save and
      `EditWishlistModal`'s Save notes. A `SaveButton` component was written first and deleted
      in review: it held no state and enforced no invariant, and every other button in that file
      is a composed class string. `filledBaseClass` now feeds both it and `accentButtonClass`,
      which had been duplicating the `bg-link` / `text-background` pairing verbatim.<br>
      _The rule the filled treatment encodes,_ since it is not self-evident: filled means
      "commit a pending draft", outlined means an action with nothing pending ("Move to
      library", "Add to library"). Keeping the dialog-level actions on `buttonClass` is what
      stops two filled buttons competing in the same dialog.<br>
      _The bug review caught, worth remembering because the draft rewrite created it:_ the
      "Finished: how was it?" prompt is `clearable={false}`, so clicking the rating the game
      already has left the draft clean, rendered no Save, and did nothing at all. Its Save is
      therefore gated on a value being **picked**, not on the draft being dirty, and
      `saveRating` dismisses without a write when nothing changed. Any future confirm derived
      from dirtiness has the same hole.<br>
      _One rough edge kept:_ while that prompt is open, both it and the rating section render a
      Save for the same draft. The alternative is dropping the prompt's picker and moving its
      question up into the rating section.

- [x] **Field suggestions work on mobile: `SuggestInput` is a real combobox** (2026-08-15).
      The `<datalist>` is gone, so the system field suggests shelves and platforms on a phone
      instead of being a bare text box there. One file plus its three call sites
      (`GameDraftForm`, `EditGameModal`, `EditWishlistModal`), as predicted.<br>
      _Two things the rewrite had to buy back that the native control gave for free._ Closing:
      a `blur` handler is the obvious choice and the wrong one, because a browser that blurs
      the input before the tap's `click` reaches an option unmounts the list and eats the pick
      — so options `preventDefault()` on mouse-down (which the synthesized mouse-down of a tap
      also honors), nothing ever takes focus off the input, and a document `pointerdown`
      listener handles outside clicks. And Escape: `useModalChrome` closes the dialog from a
      **window** listener, so the handler stops propagation while the list is open, which
      leaves the first Escape for the list and the second for the dialog.<br>
      _Two product decisions, both re-decidable._ Typing filters, but opening by click,
      chevron or ArrowDown shows everything: filtering against a value already picked would
      show a one-item list of the thing you are trying to change. And the chevron deliberately
      does not focus the input, so tapping it on a phone opens the list without the keyboard
      covering it.<br>
      _The component now renders its own `<label>`_, because a listbox nested inside the
      caller's label puts every option's text into the input's accessible name. That is where
      the `label` / `labelHidden` / `className` props came from.<br>
      _Still no suggestions on genres_ (the add form's free-text genre field), which was
      floated in the old entry and is not blocked by anything now that the control exists.

- [x] **The add form's system field suggests the platforms the game actually released on**
      (2026-08-14). Closes "Restrict the add-game 'system' suggestions…". `GameDraftForm`'s
      `systemSuggestions` is no longer a union with `existingSystems`: an IGDB pick suggests
      only `draft.platforms`, and a hand-entered game (or a pick IGDB has no platforms for)
      still falls back to the shelf systems so the field is never empty. Picking a result also
      stopped prefilling `system` with `platforms[0]` unless there is exactly one platform, and
      the `e.g. SNES, PS5` placeholder is gone.<br>
      _The normalization wrinkle this item feared never materialized:_ since migration
      `d1a83f6c25e7` the `system` column stores IGDB's own names, so suggesting a raw IGDB
      platform cannot split a shelf. Only `"PC (Microsoft Windows)"` differs from its
      `systemLabel` display form, so the field suggests raw stored values: what the suggestion
      writes is what gets POSTed, and a display label would create a second shelf beside the
      real one.<br>
      _Both halves left open here have since landed:_ the promote form in `EditWishlistModal`
      (#126), and the mobile combobox above.<br>
      _Shipped alongside it:_ the focus ring on the add form's fields was being clipped left and
      right. A Tailwind ring is a box-shadow outside the border box, the fields are `w-full`,
      and the scroll container is `overflow-x-hidden`, so only the vertical sides survived. The
      container gained `-mx-1 px-1`, which keeps the fix local instead of switching the shared
      `fieldClass` to `focus:ring-inset` and changing the ring in the filter bar too.

- [x] **A shared title is no longer treated as the same game** (2026-08-14). Closes the last
      open half of "you can add a game you already have": the duplicate check, and the
      add-game search's "already in your library" line, both key on `igdb_id` now, falling
      back to the title only for hand-entered games that have no id.<br>
      _The bug:_ five different games are called "Star Fox". Owning one of them made the
      other four unaddable (409) and flagged all five in the search results. The
      `(user_id, metadata_id)` key was always right; the title fallback beside it
      (`find_game_by_name`) was doing more than close its gap, so it now takes the incoming
      `igdb_id` and narrows to `igdb_id IS NULL` rows when there is one. The
      search-then-by-hand case it exists for still 409s, in both directions.<br>
      _The client half needed the id on the wire._ `igdbId` is now on `BaseGameRead` and so
      on `Game`/`WishlistGame`, which is one int per row on the cached `/video-games`
      payload — the cost that entry had flagged. `ownedKey` (`GameSearchStep.tsx`) builds
      the annotation's map key and looks it up, so the two sides cannot drift apart, and the
      lookup tries the id then the folded name because the server can still call a
      hand-entered entry the same game.

- [x] **Adding a game sources its genres from Wikipedia again, server-side this time**
      (2026-08-14). The add path wrote IGDB's coarse genres straight to the catalog row, so
      anything added after a backfill run disagreed with the rest of the library until the next
      one. `create_my_game` and `create_my_wishlist_item` now call `genre_service.lookup_one`
      before the transaction opens and store what it finds.<br>
      _This is the third position on a question that has now moved twice, so read the history
      before moving it again._ A `GET /api/py/genres/lookup` endpoint did this from the **browser**
      until 2026-08-12 (`23ee3e3`), and was removed because it made you watch a spinner with Save
      disabled while two third-party hops resolved. Correct at the time. What changed is that
      genres stopped being a form field at all, so nothing needs to resolve before Save and the
      lookup could move into the POST, where the same work is invisible.<br>
      _Three things bound the cost, and they are the reason this is not the old design again._
      It runs **only when the catalog row does not already exist** (`me_repo.find_metadata`
      answers that in one SELECT; the common add pays nothing). `lookup_one` **skips the Wikidata
      leg**, capping it at two requests instead of four with a 20s SPARQL ceiling. And it
      **never raises** — any miss or outage falls back to the IGDB genres the client already
      sent, so Wikipedia being down cannot fail an add. No new rate-limit bucket: unlike the old
      endpoint this sits behind `rate_limit_writes`.<br>
      _Hand-entered games:_ typed genres win, and the lookup only runs when the field is left
      blank. Overriding what someone typed into their own private row would be the same silent
      discard this branch started out fixing.<br>
      _Sourced genres bypass the create schema_, so `clean_genres` is applied by hand in
      `_genres_for_new_catalog_row`, with over-long values dropped rather than raising.
      `MAX_GENRE_LENGTH` moved next to `MAX_GENRES` in `models/game.py` so the two paths cannot
      cap differently. Note the vocabulary normalizer (`normalize_genres`, `THEME_VALUES`) now
      runs on the live add path for the first time, since it is inside `lookup_many`.

- [x] **The add form shows only fields it can actually save** (2026-08-14). Fixed the silent
      discard: `find_or_create_metadata` returns an existing `game_metadata` row untouched, so the
      name, genres and release date typed into `GameDraftForm` were dropped whenever anyone had
      already added that IGDB game. Option (a) of the three that were written up, chosen because
      the row is shared **by design** and the other two (fork a private row on divergence, or let
      one user rewrite the game for everyone) both need an answer to "who owns a catalog row" that
      still does not exist.<br>
      _The rule, and it is simpler than "does the row already exist":_ the split is
      `draft.igdbId !== null`, not a lookup. An IGDB pick resolves to the SHARED row for that id,
      so name, genres and release date are **not rendered as fields at all**; the picked game
      shows as a cover-plus-title header, and the form is System and Rating. A hand-entered game
      gets a PRIVATE row keyed on `(created_by_user_id, name)` and keeps the full form. No extra
      round trip, and it matches what `api/app/models/game_metadata.py` already claims outright
      ("nothing in the UI can edit a shared row"). `system` and `rating` are per-user columns on
      `played_games` and were never affected.<br>
      _Read-only fields were the first shape and were rejected:_ a greyed-out box invites hunting
      for the switch that turns it on, and once genres came from Wikipedia at save time, showing
      IGDB's list would have displayed a value that is not what gets stored. A field the form
      cannot set does not belong on the form.<br>
      _Still open on the server:_ it builds a brand-new shared row from the client's payload
      (name, release date, cover), so a crafted POST still defines a catalog row. That is the
      **"Anyone can define a shared catalog row for everyone"** bug, now purely server-side.

- [x] **An unwell library API no longer takes the account page down with it** (2026-08-13).
      `AccountPage` awaited `fetchMyProfile()` unguarded, so a timeout or a 500 errored the whole
      route and made account deletion unreachable exactly when someone would want it. Now caught,
      into a **third** state rather than folded into the existing null: null still means "signed
      in, never onboarded" and only that state offers the onboarding link, because telling
      someone whose profile merely failed to load to go finish setting one up is a lie. The
      degraded page drops the username row, says so in a muted line, and passes
      `detailsUnavailable` to `AccountPanel`, which explains inside the confirm prompt why the
      phrase to type became "delete". That last part was the only judgement call: the prompt's
      job is to force comprehension, so a phrase that silently got easier needed a reason on
      screen.

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
      is also a third suggestion field, joining the add and promote forms; all three went
      through `SuggestInput` and then through the combobox rewrite below.<br>
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
      `backfill_titles.py` is a **hardcoded map on purpose** (folded in from the 2026-08-03
      entry, dropped at the 20-entry cap): its first version scored IGDB candidates and could
      not tell a canonical title from an edition or spin-off whose name merely extends it,
      proposing "Elden Ring" -> _Elden Ring Nightreign_ and "Dead Cells" -> _Dead Cells+_.
      Every result needed reading anyway, so the map is that reading done once.
      **(2)** `play_sessions.game_id` still points at the user's row and must keep doing so;
      the reasons are on the column and in `api/README.md`. **(3)** "Cadence of Hyrule" is
      deliberately NOT stored under its full canonical title: the longer string matches the
      Wikipedia article "The Legend of Zelda" (its words are a subset) and takes that game's
      genres.

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
