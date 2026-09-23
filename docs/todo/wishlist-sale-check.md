# Show whether a wishlist game is on sale

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

For wishlist entries you do not already own: look up the current price on the storefront for that
entry's system, and badge the case when it is discounted. Checked at most once a day per game, so a
page view is not a fan-out at a third party.

_What already exists to copy._ `api/app/services/catalog_refresh.py` is the same shape: a read that
reaches Postgres doubles as a slow repair pass, bounded by a per-read row cap and a wall-clock
budget, stamping the row before the lookup so a slow third party cannot be hit twice. A sale check
wants that structure with a one-day staleness window instead of thirty. One caveat inherited with
it: library pages are cached until a write revalidates the tag, so a read-path refresh only runs
when a read actually reaches Postgres. "Cache the result for a day" therefore means a
`prices_checked_at` stamp on a row, not a request cache, and a popular library may go longer than a
day between real reads.

_The hard part is not the map, it is the product id._ A hardcoded `system -> shop` map is easy;
`wishlist_games.system` is free text with a display-label map (`systemLabel` in `src/lib/games.ts`),
so the map keys are whatever people typed and unknown systems have to degrade to "no check" rather
than a wrong shop. It is also nullable by design (an entry may predate deciding which platform to
buy on), so a good share of entries have no shop to check at all. Beyond that, a price lookup needs
a shop-specific product id per catalog row. Matching by name is unreliable in exactly the way
**Audit the genre vocabulary** documents, and storing one is the same "who gets to write a shared
catalog row" question as **Anyone can define a shared catalog row for everyone**.

_Sources, unverified: check before designing around any of these._ Steam has a public storefront
endpoint returning a price overview per appid. Nintendo eShop, PlayStation Store and Xbox have no
documented public price API, so a console-first library (which this one is) is the awkward case,
not the easy one. Aggregators such as IsThereAnyDeal expose a real API across stores and may be a
better single dependency than several scrapers; scraping storefront HTML is the fallback and is the
option most likely to break silently. Whatever the source, it needs a key, a rate limit and a
failure mode where a missing price shows nothing rather than an error.

_Depends on_ **Add "owned" as a field to wishlist games**: without it there is no way to say which
entries are already bought, and the badge either lies or wastes lookups on games you own.
