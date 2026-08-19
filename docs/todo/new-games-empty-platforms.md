# Run the one-time `backfill_platforms.py` catch-up against prod

_Section: **Up Next** &middot; index: [`TODO.md`](../../TODO.md)_

All that survives of "every newly created catalog row stores `platforms: []`". The code fix landed
2026-08-19; this is the catch-up it deliberately does not do.

_What shipped._ `lookup_platforms` in `api/app/services/igdb.py` asks IGDB for one game's platforms,
and `_platforms_for_new_catalog_row` in `api/app/services/me.py` calls it on both add paths, so a
catalog row carries its platforms the moment it is created. Option B from the original write-up
(look them up server-side from the `igdb_id`) rather than Option A (trust the client), which also
keeps it from entrenching **Anyone can define a shared catalog row for everyone** — the server now
sources this fact itself instead of taking the browser's word for it. `find_or_create_metadata`
lost its `platforms=None` default in the same pass, so forgetting the argument is a `TypeError`
rather than a silently empty column. Regression tests are in `api/tests/test_me_service.py`.

_Two rules the write path inherits_, both mirrored from the genre lookup next to it: it never
raises, so an IGDB outage degrades to `[]` instead of failing an add; and it stores nothing at all
when IGDB's list does not contain the console the caller is recording, which is the
variant-`igdb_id` case the last section below describes. `api/tests/conftest.py` gained `stub_platform_lookup` alongside `stub_genre_lookup` so
DB tests that add a game do not reach the network.

_What is left: the command._ Rows created before the fix still hold `[]`. Preview and apply are the
same command twice, and it prints which database it is pointed at on every run:

```
cd api
uv run python scripts/backfill_platforms.py --database-url "$PROD_URL"           # preview
uv run python scripts/backfill_platforms.py --database-url "$PROD_URL" --apply
```

_Read the preview rather than applying blind._ Any row it lists as SKIPPED is one whose `igdb_id`
landed on a variant rather than the base game ("Dead Cells" resolving to IGDB's iOS-only "Dead
Cells+"). Fix the `igdb_id` and re-run; do not force those through. After this run, nothing should
need the script again except to repair a row like that.
