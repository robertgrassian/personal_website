# The catalog keeps itself current

Two users who own the same game share one row describing it: its title, cover,
genres, and the platforms it released on. That row is written once, the first
time anybody adds the game, and the world does not hold still afterwards. A
game wishlisted the week it was announced has no release date yet. A game that
was a Switch exclusive comes to PlayStation. A Wikipedia editor fixes a genre.
Left alone, a shelf slowly becomes a record of what was true on the day someone
pressed "add".

So reading a library is also how it repairs itself. Every catalog row carries
the timestamp of the last time IGDB and Wikipedia were asked about it. When a
library is fetched, the handful of rows most out of date get re-sourced right
then, and the answers land in that same response. A row missing something it
could know (no release date, no genres, no platform list, no cover) comes back
round quickly; a row with all four waits far longer, because the things that
change about a released game change slowly.

The bounds are the interesting part, because this runs inside a page load that
a visitor is waiting on. At most a couple of rows per read, inside a wall-clock
budget well under the point where the render gives up; the timestamp is written
_before_ the lookups, so a game whose release date has genuinely never been
announced costs one attempt a day rather than one per page view; hand-entered
games are skipped entirely, since there is no canonical source for a game IGDB
has never heard of; and a lookup that fails is a lookup that failed, never an
error a visitor sees. The catch-up is a trickle rather than a sweep, which is
what `api/scripts/backfill_*.py` are still for.

The rules and the reasoning behind each one live in
[`api/app/services/catalog_refresh.py`](../api/app/services/catalog_refresh.py).
