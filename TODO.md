# Project TODO

**This file is the index, not the whole backlog.** Each entry is its ask, the corrected premise or
the constraint that decides the approach, and its cross-references: enough to tell whether an item
is the one you want without opening anything. Items carrying more than that link to
`docs/todo/<slug>.md`, which holds the diagnosis, the rejected alternatives and the design
decisions. Read a detail doc when you are about to work on that item, cross-referencing it, or
checking whether a new request duplicates it. Do not read them all by default: that is the cost
this split exists to avoid. Completed work is in [`docs/todo/completed.md`](docs/todo/completed.md).

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

- [ ] **Take a pass at the catalog rows whose `igdb_id` points at a variant, not the base game.**
      (Promoted by request 2026-08-10.) Eleven rows on prod, surfaced by `backfill_platforms.py`'s
      guard. The whole `game_metadata` row is the variant's, so genres, cover art and release date
      are wrong too, not just platforms. Fix by repointing the link rows' `metadata_id`, not by
      editing `igdb_id` in place. Related: **Audit the genre vocabulary**.
      [Details](docs/todo/igdb-variant-catalog-rows.md)

- [ ] **When adding a game, let me say I'm playing it now, or that I played it before: a play
      history section in the add-game form.** (Promoted by request 2026-08-09.) Two asks on one
      surface: a one-tap "playing it now" as the game is added, and the fuller past-playthrough
      record. Library target only, and it reuses the existing date form rather than re-typing it.
      The section must disappear when the target is `wishlist`, which **collides directly with
      "Fold + Add to wishlist into a single + Add game"**: sequence the two deliberately.
      [Details](docs/todo/add-game-play-history.md)

## Bugs

_Confirmed defects that are not urgent enough for Up Next. Roughly severity-ordered, worst first.
Promote one into Up Next when it starts blocking the sharing goal above, and demote something else
to keep that section at five._

- [ ] **Anyone can define a shared catalog row for everyone, because `igdb_id` is never checked
      against IGDB.** `create_my_game` takes the client's `igdbId` on trust, so
      `find_or_create_metadata` will mint a **shared** catalog row from an unverified id. Narrowed
      to a crafted request 2026-08-14, not fixed; what bounds it today is why this is not in Up
      Next. [Details](docs/todo/unverified-igdb-id-catalog.md)

- [ ] **A dropdown change mid-search can put back a character you already typed past.** **Not
      reproduced**: read the mechanism and confirm before fixing. This is the same bug
      `pushedSearchValues` in `useGameLibraryUrlState` was built to kill, so start there.
      [Details](docs/todo/suggest-input-search-restore.md)

- [ ] **The add form's info popover can promise genres the add then fails to store.** Accepted as a
      known limit rather than fixed. `CatalogInfo` and the add go through the same `_sourced_genres`
      decision, so they cannot disagree about the rule, only about timing. The cheaper fix was
      **explicitly declined 2026-08-14**, and this must be re-decided together with **Anyone can
      define a shared catalog row for everyone**, not separately.
      [Details](docs/todo/info-popover-genre-promise.md)

- [ ] **The genre lookup picks the wrong Wikipedia article for two titles, at a confidence score of
      1.0.** Narrowed 2026-08-14 from seven cases to two, and the two need different fixes.
      `Call of Duty: Modern Warfare 3` is the bigger half: the right article is not among the
      candidates at all, so no ranking change reaches it and `search_candidates` itself has to
      change. `Bomberman DS` is a genuine tie between string-identical titles, where detecting the
      infobox template beats any title-based rule.
      [Details](docs/todo/genre-lookup-wrong-article.md)

- [ ] **The modal scroll lock does not actually stop the page scrolling.** `useModalChrome` sets
      `document.body.style.overflow = "hidden"`, which looks correct and is why this went
      unnoticed, but **verified in Chromium 2026-08-17**: with `StatsPanel` open,
      `window.scrollBy(0, 500)` still moves the page. `html` is the scrolling element here and
      stays `overflow: visible`, so the body value never reaches the viewport. Affects all five
      surfaces sharing the hook (`StatsPanel`, `FilterSheet`, and the three owner modals), so a fix
      changes five at once and must restore the scroll position rather than jumping to the top.

- [ ] **Owner edit affordances still pop in after hydration.** The pencils and "Add game" appear a
      beat after first paint because `useViewerRelationship` resolves in a `useEffect`. No free fix:
      the options all cost something. [Details](docs/todo/owner-affordance-hydration-pop.md)

## Backlog / Ideas

- [ ] **There probably should not be two game modals. Merge `AddGameModal` and `EditGameModal` into
      one.** Raised 2026-08-14 while fixing the system field in both: one question had two answers
      depending on the dialog, and fixing it meant the same change twice. They genuinely share only
      one thing. Sequence with **When adding a game, let me say I'm playing it now**, **Make library
      and wishlist entries fully editable** and **Make viewing a game's details better**, the last of
      which is the counter-argument: if edit moves onto the card, there is no second modal left to
      merge. [Details](docs/todo/merge-game-modals.md)

- [ ] **Audit the genre vocabulary, fix the wrong values in the database with a script, and stop
      them coming back.** Prompted by **Star Fox Adventures being the only game tagged "Shooter"**.
      Premise unverified against prod, so start there. `THEME_VALUES` now bites
      every IGDB add (narrowed 2026-08-14), leaving only hand-typed genres reaching `clean_genres`.
      Genres live on the **shared** `game_metadata` row, so one correction rewrites it for every
      owner. Related: **catalog rows whose `igdb_id` points at a variant**.
      [Details](docs/todo/genre-vocabulary-audit.md)

- [ ] **Detect where the title sits on a game cover, and crop the CRT picture so it is not cut
      off.** Every game gets the same hardcoded `object-cover [object-position:center_22%]`. Do the
      detection **offline**, not in the browser. Validate the library choice before committing, and
      try the cheap fix first: it may be enough. [Details](docs/todo/cover-title-crop-crt.md)

- [ ] **An audit log of important library actions, primarily so a change can be undone.** No such
      table exists; nothing in the write path records what changed, so rating, deleting and
      promoting are all one-way. The design hangs on one decision: what a row holds. Undo-in-a-toast
      wants **Show a confirmation toast after logging a session** built first.
      [Details](docs/todo/library-audit-log.md)

- [ ] **Make database migrations run automatically as part of CD.** The premise correction is most of
      the work: **there is no CD pipeline to add a step to.** `ci.yml` only tests, and deploys go
      through Vercel's own GitHub integration, so this means creating a deploy workflow rather than
      extending one. Ordering against the deploy is the real design question.
      [Details](docs/todo/migrations-in-cd.md)

- [ ] **The four _backend_ structural refactors left over from the game-library simplification
      review.** Was nine; the five frontend ones landed on `tier3/frontend-refactors` (2026-08-07).
      The `rate_limit_writes` bypass among them was **decided 2026-08-07: leave it alone**, so
      closing it means documenting why, not changing code. Of the rest, one carries a user-facing
      copy cost worth deciding deliberately; the others are mechanical.
      [Details](docs/todo/backend-structural-refactors.md)

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

- [ ] **Show a confirmation toast after logging a session, so you know it worked.** Possibly with a
      "view all sessions" link, per **An easy way to view a game's sessions**. There is **no toast
      infrastructure and no `aria-live` region anywhere in `src/`**, so this is a site-wide primitive
      decision, not a local one, and **An audit log of important library actions** wants it first.
      [Details](docs/todo/session-log-confirmation-toast.md)

- [ ] **An easy way to view a game's sessions, and ideally edit old ones.** Two-thirds of the
      backend already exists. Editing is the expensive half and the backend genuinely cannot do it
      today. Where this lives in the UI is still open.
      [Details](docs/todo/view-and-edit-sessions.md)

- [ ] **Logging a past session should pick the whole range in one calendar popup.** A constraint
      rules out a stock range picker, so this is not a library swap. The real cost is leaving native
      date inputs behind. [Details](docs/todo/past-session-date-range-picker.md)

- [ ] **Make viewing a game's details better: the back of the case truncates genres and there is no
      way to see the rest. Design is part of this task.** `GameCaseBack.tsx` renders
      `genres.slice(0, 2)` plus a `+N more` **span, not a control**, so hidden genres are
      unreachable from the shelf. Genres are the only truncated field. Design is part of this task,
      and if edit moves onto the back face, decide what happens to `EditGameModal`.
      [Details](docs/todo/game-details-view.md)

- [ ] **Set up monitoring / alerting, specifically to get notified when a new user signs up for the
      game library.** Nothing exists today: no error tracking, no analytics, no webhook plumbing.
      Hook the **profile insert**, not the auth user. The channel is still undecided. Related but
      distinct from **Analytics on signups** below, and worth deciding together so they are not
      built twice. [Details](docs/todo/signup-monitoring-alerts.md)

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

- [ ] **User search, so you can find people to follow without knowing their username.** Almost no
      schema work left. Held back from Phase 5 (2026-07-30) to keep that MVP small, and the follow
      graph already gives a working discovery path, so this is an enhancement. Two decisions: its own
      rate-limit bucket rather than the shared `writes` one, and whether results rank by trigram
      similarity or just filter. [Details](docs/todo/user-search.md)

- [ ] **Give library games a "notes" field, like wishlist entries already have, then grow it into a
      real play journal.** Notes exist only on the wishlist side (`wishlist_items.notes`, capped at
      1000); the `games` table has no column. What makes it more than a column add is the journal
      half. [Details](docs/todo/game-notes-play-journal.md)

- [ ] **Overhaul the wishlist promote flow: it is "played", not "bought".** Two premises in today's
      flow are wrong: the copy says "I bought it", and a promoted game arrives **unrated**, landing
      in the "Unrated" group under `groupBy: "rating"`.
      [Details](docs/todo/wishlist-promote-played.md)

- [ ] **Make library and wishlist entries fully editable, and keep the two edit modals 1:1.**
      The console-change half **shipped 2026-08-11**, so the `(user_id, metadata_id)` 409 has an
      escape hatch and this is back to the broader "edit everything" want, at ordinary backlog
      urgency. Genre editing here would also unblock **Audit the genre vocabulary**.
      [Details](docs/todo/fully-editable-entries.md)

- [ ] **Fold "+ Add to wishlist" into a single "+ Add game" that picks its destination.**
      `GameLibrary.tsx` swaps the button label by view, and `AddGameModal` already takes a
      `target: "library" | "wishlist"` prop (`AddGameModal.tsx`) that swaps the rating
      picker for a star checkbox and makes the system optional. So the modal can already do
      both: what is missing is a destination switcher (two tabs) inside it, defaulted to
      whichever view the button was clicked from.<br>
      _Watch:_ `target` currently changes required fields, so the switcher has to re-validate
      rather than just re-label — flipping from wishlist to library with an empty system must
      block submit, not silently post.

- [ ] **A username rename feature must delete `usernameByUserId` (`src/lib/meApi.ts`).**
      `usernameByUserId` is a module-scope memo of user id → username, correct **only** because
      usernames are assigned once at onboarding and no rename endpoint exists. Adding renaming
      without deleting from it serves a stale cache tag.
      [Details](docs/todo/username-rename-cache-delete.md)

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

Archived to [`docs/todo/completed.md`](docs/todo/completed.md) so this file stays cheap to read.
Completed entries move there, newest first, capped at 20.
