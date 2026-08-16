# User search, so you can find people to follow without knowing their username.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Held back from Phase 5 (2026-07-30) to keep that MVP small; the follow graph itself shipped, and
with auto-follow seeding both lists, browsing Following/Followers is a working discovery path, so
this is an enhancement rather than a prerequisite. Still the thing that makes `/video-games/start`'s
pitch about browsing other people's libraries true for a stranger.

_Almost no schema work left:_ `pg_trgm` and **both** GIN indexes on `profiles`
(`ix_profiles_username_trgm`, `ix_profiles_display_name_trgm`) shipped in the baseline migration,
and `"search"` is already in `RESERVED_USERNAMES`, so `/users/search` cannot collide with
`/users/{username}`. What is missing is the endpoint, a `UserSummary[]` response (the schema already
exists, `api/app/schemas/users.py`), and a debounced search input.

_Two decisions to make:_ give it its own rate-limit bucket rather than the shared `writes` one,
following `igdb_search` (`api/app/services/igdb.py`) — it is a read, and an unbudgeted fuzzy search
is the cheapest way to make Postgres work hard. And decide whether results rank by trigram
similarity or just filter, since with `MAX_USERS` at 100 the naive version is indistinguishable and
the index is doing nothing yet either way.
