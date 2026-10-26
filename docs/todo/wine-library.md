# A wine library at `/wine`: a log of bottles I've had, a label lookup for the wine shop, and stats on what I like.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

The full design is the tech spec, [`docs/specs/wine.md`](../specs/wine.md). This doc carries only
what routing needs; the spec owns the detail, so do not restate it here.

_Status 2026-10-26:_ first-pass spec drafted. **Next step is hardening it section by section**
with the owner, before phase 0.

_The requirement that shapes it:_ the lookup must answer a label that names only a producer and a
cuvée, such as Las Jaras "Glou Glou", with no grape or region on it. The artifact's reference data
(grapes, regions, terms) cannot, so the spec adds a bottle catalog filled on demand by a Claude +
web search resolver, owner-only and rate-limited.

_Where it came from:_ the "Wine Shop Cheat Sheet" artifact
(https://claude.ai/code/artifact/2d2895db-77d9-4ae5-ae03-2304870f5e5e). Porting it 1:1 was
decided against on 2026-10-26: as a generic reference it is not personal, and Wine Folly and
Vivino already do that better.

_Start with phase 0 of the spec_, a resolver eval over ~30 hard real labels. It answers whether
lookup-first is viable at all before any migration or UI exists.
