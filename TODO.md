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

- [ ] **Implement account deletion (`DELETE /api/py/me/account`).** Promoted from Backlog
      2026-07-30: the last unbuilt thing the spec actually committed to, and the one item here
      that is a promise rather than a polish. Spec decision #22 planned it (cascade down from
      `profiles` + `auth.users` removal via the Supabase Admin API, which
      `core/supabase_admin.py` already wraps for the over-cap cleanup), but it was never built.
      Noticed 2026-07-28 while editing `/privacy`: the policy described deleting your account
      as though it were self-serve, so the copy now points at email instead, which is the only
      mechanism that actually exists. Once the endpoint and a UI control ship, update that
      paragraph (there is a comment in `src/app/privacy/page.tsx` marking it). Note
      `rate_limits` has no FK to `profiles`, so those rows will not cascade and need deleting
      explicitly.

- [ ] **Improve the add-game IGDB search: more results, and let the query name the console.**
      Two complaints, one surface.<br>
      _Too few results (raised 2026-08-04):_ searching "star fox" does not surface the Switch 2
      remake at all. `SEARCH_LIMIT = 10` (`api/app/services/igdb.py:34`) with no paging, and a
      franchise that old fills ten slots with older entries. Want either a longer list, a
      next-page arrow in the picker, or both. Paging means adding `offset` to the Apicalypse
      body (`api/app/services/igdb.py:186-189`), threading it through
      `GET /api/py/igdb/search` and the `searchGames` Server Action, and holding a page number
      in `AddGameModal`. Watch the rate limit: every page is another charge against the
      `igdb_search` bucket, so a next-page click must not fire on debounce the way typing does.<br>
      _Typing the platform should work:_ "star fox switch 2" currently returns nothing, because
      the whole string goes to IGDB's `search`, which matches game names only. Fix is to split
      recognized platform words off the query and turn them into a `where platforms = (...)`
      clause instead of leaving them in the search text. That needs a platform-name lookup
      (IGDB's `/platforms`, cached), and it is the same IGDB-name-vs-shelf-label mapping the
      "restrict the add-game system suggestions" backlog item needs — do them together.<br>
      _Fuzzy matching, noticed 2026-08-03 while building the title backfill:_ the raw pass-through
      is also unforgiving of the way people type. "Civ 6" returns nothing, and "Pokemon Fire Red"
      returns _Pokémon Fire Red Extended_, a ROM hack, rather than the game.<br>
      Not urgent as data-correctness goes: the add flow shows you the candidates and you pick
      one, so a poor first hit costs a second look rather than wrong data. It is a real
      dead-end for the user only when the game is not in the list at all, which is the Star Fox
      case above and the reason this moved from "someday" to a concrete ask.

## Backlog / Ideas

- [ ] **Make viewing a game's details better: the back of the case truncates genres and there is
      no way to see the rest. Design is part of this task.** `GameCaseBack.tsx:70-77` renders
      `genres.slice(0, 2)` plus a `+N more` span — and that span is plain text, not a control,
      so the hidden genres are genuinely unreachable from the shelf. Genres are the only
      truncated field: name is `line-clamp-2`, system and release date render in full.<br>
      _Two things to hold onto, per the ask:_ keep the rotating case, it is the best thing on
      the page; and do **not** solve this by cramming more onto the back face, which is a
      ~2.5rem-tall text column at `text-[10px]` and already full.<br>
      _One idea, not a decision:_ a "more" affordance on the back that opens a popup with the
      full metadata. Worth considering alongside it: a hover/long-press tooltip listing all
      genres, a details panel that slides in beside the shelf rather than over it, or making
      each genre a chip that sets the genre filter (which turns the overflow problem into a
      navigation feature).<br>
      _The wiring detail that will bite whichever design wins:_ the entire case is one
      `<button>` with `onClick={() => setFlipped(f => !f)}` (`GameCase.tsx:97-102`), so a
      clickable element **inside** the back face is a button nested in a button, which is
      invalid HTML and unreliable for keyboard and screen-reader users. `GameCase` already
      solved this once for the owner pencil: it is an absolutely-positioned **sibling** of the
      flip button, not a child (there is a comment at `GameCase.tsx:88-92` and again at
      `:206-211` explaining exactly that). Follow that pattern, or make the back face stop
      being a button. Whatever opens must also work on touch, where there is no hover.<br>
      Related: the "notes / play journal" backlog item below wants a bigger reading surface for
      per-game data too, so a details view built here is likely where notes end up living.

- [ ] **Library filter search should fuzzy match, but stay strict** — specifically, typing
      "pokemon" should find the games spelled with the accented "é". Today
      `passesBaseFilters` (`src/components/video_games/pipeline.ts:27`) is a plain
      `name.toLowerCase().includes(search.toLowerCase())`, so it is case-insensitive and nothing
      more: "Pokémon" is invisible to "pokemon", and every shelf goes empty while you are
      halfway through typing the word.<br>
      _The cheap fix covers the actual complaint:_ normalize both sides with
      `.normalize("NFD").replace(/\p{Diacritic}/gu, "")` before comparing, which folds é→e, ō→o
      and the rest without pulling in a fuzzy-match library. That alone solves Pokémon, Ōkami
      and Pikmin-style titles.<br>
      _"Strict" is the constraint worth keeping._ True fuzzy matching (Levenshtein / trigram /
      fuse.js) starts returning things you did not ask for on a two-character query, which is
      worse than a miss on a library you know by heart. If it goes past diacritic folding, keep
      it to punctuation/whitespace insensitivity ("resident evil 4" matching "Resident Evil 4:
      Remake", ignoring `:` and `-`) rather than edit distance. Same helper should apply to the
      wishlist filter, which shares this function.

- [ ] **Set up monitoring / alerting, specifically to get notified when a new user signs up for
      the game library.** There is nothing today: no error tracking, no analytics, no email or
      webhook plumbing anywhere in the repo. The only observability is stdlib `logging` in a
      handful of places (`api/app/services/me.py:46`, `core/supabase_admin.py:20`) landing in
      Vercel function logs, which nobody watches.<br>
      _The event to hook is the profile insert, not the auth user._ OAuth mints a Supabase
      `auth.users` row before onboarding, so an abandoned onboarding leaves one with no profile,
      and an over-cap signup has its auth user deleted again
      (`create_my_profile`, `api/app/services/me.py:268-325`). The single moment that means
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
      volume this is sized for: `max_users` is 100 (`api/app/core/config.py:73`), so this is a
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
- [ ] Normalize game metadata into a shared catalog (a `game_metadata` table + per-user `played_games`/`wishlist_games` link tables) — today `games` and `wishlist_items` each carry their own copy of name/system/genres/release_date/image_url. Spec §4.2 deliberately chose denormalized-with-`igdb_id` for v1 (canonical rows need an ownership/moderation story; user-entered games lack a canonical key). Revisit at Phase 4 when cross-user duplication actually exists — the `igdb_id` column on both tables is the planned backfill key (group by it, extract canonical rows, repoint).
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
      (`targetsForeignEnvironmentApi`), so it's reads plus a real session — the known
      no-staging trade-off. The real fix is the staging-environment backlog item.<br>
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
