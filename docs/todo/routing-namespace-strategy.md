# Decide the routing/namespace strategy as the site grows into multiple apps.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

**Half-settled 2026-07-29:** nesting per-user libraries under `/video-games/u/` committed to per-app
route prefixes on one domain, option (a) below, for the game library. Auth stays top-level
(`/onboarding`, `/auth/*`) because it is a site-wide identity system.

_What is still open_ is whether that holds when a **second** app arrives.

The options once more apps exist:

- **(a) Keep everything on `rgrassian.com`** with top-level auth and per-app route prefixes.
  Simplest, and one shared session across apps.
- **(b) Split an app onto a subdomain** like `games.rgrassian.com`. Cleaner isolation and
  independent deploys, but subdomains are separate cookie origins, so sharing the login session
  needs a `.rgrassian.com` cookie domain plus Supabase and Vercel redirect wiring. That works
  against cross-app SSO.

Leaning toward (a) until an app genuinely needs isolation.
