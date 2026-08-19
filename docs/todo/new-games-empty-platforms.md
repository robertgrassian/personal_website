# Every newly created catalog row stores `platforms: []`: neither add path passes `platforms` to `find_or_create_metadata`

_Section: **Up Next** &middot; index: [`TODO.md`](../../TODO.md)_

`find_or_create_metadata` (`api/app/repositories/me.py`) takes `platforms: list[str] | None = None`
and stores `platforms or []`. Neither caller in `api/app/services/me.py` passes it: not
`create_my_game`, not `create_my_wishlist_item`. So the column is empty on every row the add path
creates, and `scripts/backfill_platforms.py` is the only thing that has ever filled it. Its own
header says as much: "Re-run it whenever new games have been added and their platforms matter."
That is a workaround for this gap, not the intended design.

_Scope, which is narrower than it first reads._ Only rows the add CREATES are affected. An add that
resolves to an existing catalog row returns it untouched, platforms intact, so a game someone else
already added is fine. With one real user today almost every add creates a row, so in practice it
is nearly every new game, but the fix does not need to touch existing rows.

_Hand-entered games are correctly empty and stay that way._ `platforms` is IGDB's fact about a
game; there is no canonical list for a title IGDB has never heard of. The backfill script already
skips `igdb_id IS NULL` rows for this reason and calls "every row has platforms" neither reachable
nor desirable. The fix applies only where an `igdb_id` is present.

_The decision: where the platform names come from._ Both options work; they differ in what they
trust.

_Option A, take them from the client._ `_parse_results` in `services/igdb.py` already puts
`platforms` on every search result, so the browser is holding IGDB's list at the moment it confirms
an add. Adding the field to `GameCreate` / `WishlistCreate` and passing it through is a handful of
lines and costs no network call. The objection is that it writes client-supplied data onto a SHARED
row, which is the same trust problem as **Anyone can define a shared catalog row for everyone,
because `igdb_id` is never checked against IGDB** — decide the two together rather than solving
this one in a way that entrenches that one.

_Option B, look them up server-side from the `igdb_id`._ `fetch_platforms` in
`scripts/backfill_platforms.py` already does exactly this query (`fields platforms.name; where id =
(...)`) through `_run_query`, so it is a lift into a service rather than new code. It puts a
network call in the write path, but that path already makes one: `genre_service.lookup_one` hits
Wikipedia when an add creates a row. Follow that precedent's safety rule if this goes the same way
— run only when the row is new, and never raise, so a third-party outage cannot fail a write. The
"is it new?" plumbing already exists and is already called on this path: `find_metadata` in
`repositories/me.py` exists so the add can tell whether the genres it is about to send will be used
at all, and the same answer gates a platforms lookup for free.

_Preferred: B_, because it is authoritative and the genre lookup has already paid and justified the
cost of an outbound call on create. Worth confirming against the shared-catalog bug before
building.

_The one-time prod catch-up._ Rows already created since the platforms work landed need filling
once; after the code fix, nothing should ever need the script again. `backfill_platforms.py`
previews by default and takes a database URL, so the audit and the fix are the same command twice:

```
cd api
uv run python scripts/backfill_platforms.py --database-url "$PROD_URL"           # preview
uv run python scripts/backfill_platforms.py --database-url "$PROD_URL" --apply
```

It prints which database it is pointed at on every run. Note its own warning: a row whose `igdb_id`
landed on a variant rather than the base game gets a wrong list, which is worse than an incomplete
one — fix the `igdb_id` and re-run rather than accepting the output blind.

_Add a regression test with the fix._ `tests/test_me_service.py` already covers that an existing
row is returned untouched; the missing case is that a NEW row created through the add path comes
out with platforms populated.
