# Anyone can define a shared catalog row for everyone, because `igdb_id` is never checked against IGDB.

_Section: **Bugs** &middot; index: [`TODO.md`](../../TODO.md)_

Found in the code review of the catalog migration (PR #105, 2026-08-10) and documented as a known
gap in `api/README.md`. `create_my_game` takes the client's `igdbId` on trust:
`find_or_create_metadata` looks the id up and, finding nothing, creates the SHARED row from whatever
`name`, `genres` and `releaseDate` the payload carried. So `POST /me/games {"name": "anything",
"igdbId": 1051}` from any onboarded account defines Chrono Trigger's catalog row, and **every user
who adds that game afterwards inherits it**. First-write-wins, with no repair path: nothing in the
UI edits a shared row, by design.

_Why this is filed here and not in Up Next:_ it needs a second account acting badly, and there is
one user. Ranked over the duplicate-add item because the damage is silent, shared, and
currently unrepairable from the app.

_Narrowed to a crafted request 2026-08-14, but not fixed._ The add form now renders the catalog
fields read-only for any IGDB pick (`fromIgdb` in `GameDraftForm`), so the honest UI path posts
IGDB's own name, genres and release date verbatim and can no longer define a shared row from typed
text. The API is unchanged and still trusts the payload, so a hand-rolled POST does exactly what it
always did. This is now purely a server-side hole.

_What already bounds it, so the fix is not urgent:_ `max_users` is 100 and signup is capped
(`api/app/core/config.py`); every `/me/*` write goes through `rate_limit_writes`
(`api/app/core/guards.py`); and `validate_igdb_image_url` restricts `imageUrl` to the IGDB CDN, so
the cover can only be swapped for another real IGDB cover, never for arbitrary content.

_The fix, and its cost:_ verify the id against IGDB inside `create_my_game` and build the catalog
row from **IGDB's** answer rather than the client's. That puts a network call in the write path,
which is the thing to weigh: the add flow already called IGDB once to find the game, so this is a
second call for data the client just received. Cheaper variants worth considering first: only verify
when the row does not yet exist (the common case is a hit, which costs nothing), or accept the
client's values and reconcile in a background sweep. Note `igdb_search` already has its own
rate-limit bucket (`api/app/services/igdb.py`) that a write-path lookup would need to either share
or deliberately bypass.

Related: **"Make library and wishlist entries fully editable"** has to answer the neighbouring
question — whether editing a shared row forks a private copy, restricts the edit to private rows, or
genuinely changes the game for everyone. Answer both together; they are the same question about who
owns a catalog row.
