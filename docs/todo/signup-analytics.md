# Analytics on signups.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Carried over from the spec's Phase 6 (2026-07-30), and the only Phase 6 item with no groundwork at
all.

_The narrow question worth answering_ is how far people get: land on `/video-games` → click sign in
→ complete OAuth → pick a username → add a first game. The onboarding funnel is several hops and any
of them can silently lose someone.

_Weigh against the privacy policy_, which is currently short and honest partly because there is no
third-party analytics to disclose. A self-hosted counter or Vercel's own analytics keeps it that
way; a third-party script means updating `/privacy`.

Related but distinct from **Set up monitoring / alerting**, and worth deciding together so they are
not built twice.
