# Remove the `/api/py` alias left by the `/api/library` rename (2026-08-18)

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Part of **Decide the routing/namespace strategy**, which half-settled toward per-app prefixes on
one domain: `/api/library` is the first instance of that.

_Why it exists at all._ A build fetches from the API that is currently DEPLOYED, not the one in the
commit being built, so the deploy shipping the rename asked a production that had not got the new
prefix yet. `/video-games` passes `missingProfileIsBug` and the OG image route calls `getGames`
without `allowMissing`, so both throw on a 404 rather than degrading. That failed the Vercel build,
which meant the new API never deployed, which meant the next build failed identically. A deadlock,
not a transient error, and the same one the follow-list comment in `libraryApi.ts` already
describes for newly added endpoints. "Deploy and then redeploy" does not break it.

_The pieces, and the order to remove them in._ The prerender-only fallback in `fetchUserResource`
goes first and independently: it is dead the moment production serves `/api/library`, which is true
as soon as the rename deploy is live. The other three are one change: `LEGACY_API_PREFIX` in
`api/app/core/config.py` (with the second `include_router` call in `main.py`) and in
`src/lib/apiPrefix.ts`, the second rewrite in `next.config.ts`, and `api/py` in the matcher in
`src/middleware.ts`. Those keep a browser tab loaded before the rename working, so they come out
once no such tab can plausibly still be open.

_What the alias is not._ A prefix alias, not a compatibility layer: it serves today's routes under
the old prefix, not the paths renamed underneath it in the same change (`/igdb/search`,
`/me/catalog-preview`). Those needed no alias, because every server-side caller ships in the same
Vercel deployment as the API and cuts over atomically with it.

The alias is covered by `api/tests/test_api_prefix.py`; deleting the two tests naming
`LEGACY_API_PREFIX` is part of this.
