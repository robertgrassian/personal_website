# Add public libraries to `sitemap.ts`.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Carried over from the spec's Phase 6 (2026-07-30). Today the sitemap lists static routes only;
`/video-games/u/[username]` pages are public and indexable but unlisted, so search engines reach
them only by crawling follower lists.

_Why it was skipped once already._ When the route moved under `/video-games/u/` (2026-07-29): the
sitemap already lists `/video-games`, which **is** Robert's library, so adding
`/video-games/u/rgrassian` would have submitted two URLs for identical content. A canonical link is
the fix for that, not a sitemap entry.

_With real signups that reasoning inverts_, because the entry becomes a generated list rather than
one duplicate URL.

_The open decision._ Whether users can opt out of indexing. Spec decision #6 made every library
public with no privacy setting, and "public" and "indexed by Google" are not the same promise.
