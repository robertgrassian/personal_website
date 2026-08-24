# Project TODO

One line per item; the detail is in `docs/todo/<slug>.md` behind each `[Details]` link. The rules
that govern this file (sections, caps, what goes where) live in the `proj-todo` skill, not here.

## Up Next

The organizing goal is **sharing the site with people**, so Up Next holds what should be true
before that happens.

- [ ] **When adding a game, let me say I'm playing it now, or that I played it before: a play
      history section in the add-game form.** (Promoted by request 2026-08-09.) Collides with
      **Fold "+ Add to wishlist" into a single "+ Add game"**.
      [Details](docs/todo/add-game-play-history.md)

## Bugs

_Confirmed defects that are not urgent enough for Up Next. Roughly severity-ordered, worst first._

- [ ] On desktop: on wishlist game, if i click the notes section, the sticky filter bar dissapears (in the background).
      When exiting and going back to the wishlist, it reappears. It only happens with this input. When we fix it
      we should check if the notes for library games is implemented and if so if it happens for that too.

- [ ] **Anyone can define a shared catalog row for everyone, because `igdb_id` is never checked
      against IGDB.** [Details](docs/todo/unverified-igdb-id-catalog.md)

- [ ] **A dropdown change mid-search can put back a character you already typed past.** **Not
      reproduced.** [Details](docs/todo/suggest-input-search-restore.md)

- [ ] **The add form's info popover can promise genres the add then fails to store.** Re-decide
      together with **Anyone can define a shared catalog row for everyone**.
      [Details](docs/todo/info-popover-genre-promise.md)

- [ ] **The genre lookup picks the wrong Wikipedia article for two titles, at a confidence score of
      1.0.** [Details](docs/todo/genre-lookup-wrong-article.md)

- [ ] **Owner edit affordances still pop in, now at hydration rather than a round trip later.** The
      localStorage cache landed 2026-08-19; closing the last gap means reaching first paint, which is
      a decision, not a tweak. [Details](docs/todo/owner-affordance-hydration-pop.md)

## Backlog / Ideas

- [ ] **A site email address for feedback, so people without a GitHub account can report bugs and
      ideas.** `/privacy` already publishes `rgrassian@gmail.com` twice, so an address exists: what
      is missing is one that is not a personal inbox, and any link to it from the library.
      [Details](docs/todo/feedback-email-address.md)

- [ ] Add "owned" as a field to wishlist games. Inloves migration and checkbox added to edit wishlist game UI.

- [ ] **Delete the prerender-only `/api/py` retry in `libraryApi.ts`'s `fetchUserResource`, and
      `LEGACY_API_PREFIX` with it.** All that survives the 2026-08-18 prefix rename, and dead the
      moment that rename is live in prod: it exists so the deploy shipping it can build against a
      production still on the old prefix.

- [ ] **`AddGameModal` is the last dialog left. Decide whether adding a game moves onto the detail
      card too.** No longer a merge of two: the other dialogs were deleted 2026-08-20. Sequence with
      **When adding a game, let me say I'm playing it now**.
      [Details](docs/todo/merge-game-modals.md)

- [ ] **Audit the genre vocabulary, fix the wrong values in the database with a script, and stop
      them coming back.** Premise unverified against prod; the eleven variant-id rows named inside
      were fixed 2026-08-17. [Details](docs/todo/genre-vocabulary-audit.md)

- [ ] **Detect where the title sits on a game cover, and crop the CRT picture so it is not cut
      off.** [Details](docs/todo/cover-title-crop-crt.md)

- [ ] **An audit log of important library actions, primarily so a change can be undone.** Wants
      **Show a confirmation toast after logging a session** built first.
      [Details](docs/todo/library-audit-log.md)

- [ ] **Make database migrations run automatically as part of CD.** There is **no CD pipeline** to
      add a step to. [Details](docs/todo/migrations-in-cd.md)

- [ ] **The four _backend_ structural refactors left over from the game-library simplification
      review.** [Details](docs/todo/backend-structural-refactors.md)

- [ ] **Move the Following/Followers tabs to their own route.**
      [Details](docs/todo/followers-own-route.md)

- [ ] **Show a confirmation toast after logging a session, so you know it worked.** A site-wide
      primitive decision, not a local one. Wanted first by **An audit log of important library
      actions**; possibly with a link, per **Editing and deleting past sessions**.
      [Details](docs/todo/session-log-confirmation-toast.md)

- [ ] **Editing and deleting past sessions.** Viewing them shipped 2026-08-22, in both places it
      was wanted. What is left is backend: `PATCH /me/sessions/{id}` only closes, so a real
      `SessionUpdate` and a `DELETE` do not exist. [Details](docs/todo/view-and-edit-sessions.md)

- [ ] **Logging a past session should pick the whole range in one calendar popup.**
      [Details](docs/todo/past-session-date-range-picker.md)

- [ ] **Set up monitoring / alerting, specifically to get notified when a new user signs up for the
      game library.** Decide together with **Analytics on signups**.
      [Details](docs/todo/signup-monitoring-alerts.md)

- [ ] **Document the database restore procedure.** Backups exist; the written "the data is gone, now
      what" does not. [Details](docs/todo/db-restore-procedure.md)

- [ ] **Add public libraries to `sitemap.ts`.** Wants a decision on whether users can opt out of
      indexing. [Details](docs/todo/sitemap-public-libraries.md)

- [ ] **Analytics on signups.** Decide together with **Set up monitoring / alerting**.
      [Details](docs/todo/signup-analytics.md)

- [ ] **User search, so you can find people to follow without knowing their username.**
      [Details](docs/todo/user-search.md)

- [ ] **Give library games a "notes" field, like wishlist entries already have, then grow it into a
      real play journal.** [Details](docs/todo/game-notes-play-journal.md)

- [ ] **Make library and wishlist entries fully editable.** Now just the shared `game_metadata`
      question: name, genres, release date, cover art. The per-entry fields all landed by
      2026-08-20. Would unblock **Audit the genre vocabulary**.
      [Details](docs/todo/fully-editable-entries.md)

- [ ] **Fold "+ Add to wishlist" into a single "+ Add game" that picks its destination.** Collides
      with **When adding a game, let me say I'm playing it now**.
      [Details](docs/todo/merge-add-buttons.md)

- [ ] **A username rename feature must delete `usernameByUserId` (`src/lib/meApi.ts`).**
      [Details](docs/todo/username-rename-cache-delete.md)

- [ ] Library-level "create session" button (owner-only), for any game without opening its edit
      modal. [Details](docs/todo/library-create-session-button.md)

- [ ] Profile pictures for user accounts (post-v1: likely Supabase Storage plus an upload/crop flow,
      shown in the profile header and follower lists)

- [ ] Homepage customization per user (post-v1: hero/backdrop, shelf styling, featured games. Scope
      TBD)

- [ ] Staging environment: previews are read-only against prod, so writes first run for real in
      prod. [Details](docs/todo/staging-environment.md)

- [ ] Decide the routing/namespace strategy as the site grows into multiple apps. **Half-settled
      2026-07-29** toward per-app route prefixes on one domain.
      [Details](docs/todo/routing-namespace-strategy.md)

- [ ] "Current Hobbies" section on `/about`, starting with currently-playing games.
      [Details](docs/todo/current-hobbies-about.md)

- [ ] Alternate "currently playing" display: a full-width Marquee Banner as a sibling of the CRT.
      [Details](docs/todo/marquee-banner-display.md)

- [ ] Make an "improve" skill that runs a code review on recent changes, follows up on obviously
      actionable items, cleans up comments, and checks best practices

- [ ] Fun interactive game/toy page, for fun and for learning TypeScript.
      [Details](docs/todo/interactive-toy-page.md)

- [ ] Start filling in `last_played` dates (ISO `YYYY-MM-DD`) for recently played games; build a
      "recently played" feature on the stats page

- [ ] test that my linting on prs is working

- [ ] Dark mode toggle

- [ ] A fun game to make could be a "shift" inspired game... i liked that one a lot

- [ ] Stats page: average rating per genre? Any other cool ones? Maybe average rating per X, ie
      ranked genres, ranked consoles

- [ ] Game library "want to play"

- [ ] Movie library want to watch list, maybe a whole movie's seen section too...

- [ ] Book library, similar to the movie library idea. Raises whether the route becomes `/library`
      with games, movies and books as sub-routes, so it touches **Decide the routing/namespace
      strategy**. [Details](docs/todo/book-library.md)
