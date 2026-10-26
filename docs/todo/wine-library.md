# A wine library at `/wine`: a log of bottles I've had, a label lookup for the wine shop, and stats on what I like.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

_The first step is a tech spec, not code._ Write `docs/specs/wine.md` (beside
`docs/specs/recommendations.md`, which sets the precedent) with phases small enough to build one
at a time. No migration or component lands before the spec does.

_Where it came from:_ a "Wine Shop Cheat Sheet" artifact
(https://claude.ai/code/artifact/2d2895db-77d9-4ae5-ae03-2304870f5e5e). Type any word from a
label (grape, place, label term) and get sweetness, body, acidity, tannin, pairings, similar
wines, and a ladder showing where it sits (Brut to Doux, Kabinett to TBA, Bourgogne to Grand Cru),
plus "Quick picks" lists by occasion. About 120 grapes, regions, styles and label terms, written
as a JS array. Porting it 1:1 was decided against on 2026-10-26: as a generic reference it is
not personal, and Wine Folly and Vivino already do that better. What makes it belong on the site
is the library. The artifact is the source of the concept and the reference data, not the design.

## The three jobs, one site

_Discovery, in the shop._ Search the label in front of me and get two things: static facts from
the reference data (sweetness, body, tannin, similar wines, ladder position), and analysis against
my own library (the most similar wines I've had and how I rated them, and maybe a recommend / skip
verdict).

_Library, looking back._ The bottles I've had, with ratings and notes, shaped and styled like the
game library. That route is the site's biggest and sets its look, so this should read as its
sibling: objects on wood, a detail card, owner edits in place.

_Stats, for free._ Once ratings exist, show what they say about my taste: ratings by grape,
region, body, sweetness. This is how I learn what I like. The game library's stats panel and the
SQL tab (`SqlQueryPanel.tsx`, `queryTables.ts`) are the precedent.

## Decisions the spec has to make

_Rating shape._ An overall score is a must, and maybe sub-scores too. Decide whether the overall
reuses the game library's letter tiers (`RATINGS` in `src/lib/games.ts`, S to F) for consistency,
or uses a finer scale that stats can average. Sub-scores (for example, value for money and
would-buy-again, or tasting axes) earn their place only if a stat or the lookup uses them. Asking
"which sub-score would change a decision in the shop?" is the test.

_The recommend / skip verdict, which I was unsure about._ The case for it: it is the question
being asked in the shop. The case against: early on, with few rated bottles, a verdict is noise
dressed up as advice, while "the three closest wines you've had: B, A, C" is honest at any size
and lets me judge for myself. One option is to show similar wines first and gate the verdict
behind a minimum number of ratings, the way recommendations are gated at 10+ rated games.

_What a bottle is, and where its facts come from._ Wine has no IGDB: Vivino has no public API and
Wine-Searcher's is paid. Most likely a logged bottle is hand-entered (producer, name, vintage,
price, where bought) and linked to one or more reference entries (grape, region, style), from which
it inherits sweetness, body and the rest, with per-bottle overrides. Confirm there is no usable
free source before settling on that. Similarity, for both the lookup and the stats, then comes from
the reference profile vectors (`s`, `b`, `a`, `t` in the artifact) plus shared grape and region.

_Where the reference data lives._ It is static and editorial, so a typed TS module is the cheap
answer, and in that case the shop lookup works with no backend. But if logged bottles link to
reference entries in Postgres (needed for SQL stats by grape or region), it needs a table or a
seed. Decide which side owns it. The content was AI-written and will now be under my name, so
proofread it either way.

_Single-user or multi-user._ The game library is multi-user (per-user routes, follows, onboarding).
Wine could start as mine only, at `/wine`, with no `/wine/u/[username]`. Decide that up front: it
determines whether routes, cache tags and the data model take a user from day one.

_Public or private._ Is the log public, like the game library? The rule that a public read carries
public fields only (see CLAUDE.md) applies the moment anything is private, such as notes or the
price paid.

_Label input._ Typing comes first. Photographing a label (OCR) is a later phase, if ever.

## Constraints already known

- **Routing:** `/wine` follows the per-app-prefix lean in **Decide the routing/namespace
  strategy**, and is kebab-case. The `/library` umbrella floated in **Book library** is for media.
  Wine is not media, so it should probably stay top-level either way. Note that `/library` is
  currently a redirect-only resolver.
- **The shelf machinery only handles games** (the same finding as in **A music app at `/music`**).
  A wine rack reusing `shelves/` and `GameCase.tsx` would be the first real test of whether the
  shelf theme system generalizes, so decide early: generalize it or build a sibling.
- **The read and write paths should mirror the game library's**, as laid out in
  `docs/architecture.md`: a cached server read with cache tags, writes through Server Actions to
  `/me` routes, and owner affordances that create rows gated on `useIsConfirmedOwner`.

## A first guess at phases, for the spec to replace

1. The reference data as a typed module and the shop lookup page, restyled to the site. Useful
   on its own and needs no backend.
2. The bottle log: table, API, an owner add/edit flow on the one-Save model, ratings.
3. The library view: rack or shelf, detail card.
4. Lookup against the library: the most similar wines I've had, then possibly the verdict.
5. Stats.
