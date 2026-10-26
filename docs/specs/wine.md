# Tech spec: wine library

Status: **draft**, 2026-10-26. First pass, to be hardened section by section. Not started.

A wine log at `/wine` that does three jobs on one page:

1. **Discovery, in the shop.** Type what is on the label in front of me and get facts about the
   wine, plus how it relates to what I have already had and rated.
2. **Library, looking back.** The wines I have had, with ratings and notes, as a sibling of the
   game library in look and in architecture.
3. **Stats.** What my ratings say about my taste, by grape, region, style and structure.

The concept and the reference data come from the "Wine Shop Cheat Sheet" artifact
(https://claude.ai/code/artifact/2d2895db-77d9-4ae5-ae03-2304870f5e5e). Its design does not
carry over; see [Look and feel](#look-and-feel).

## Decisions proposed

Each row is a proposal, not a settled answer. Hardening confirms or replaces them one at a time.

| Question                  | Proposal                                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who has a wine library    | **Me only in v1**, at `/wine`. The schema is per-user from day one, so opening it up later means routes and onboarding, not a migration. See [Single-user](#single-user). |
| Who can see it            | **Public read**, like the game library. Price paid and notes are private; see [Public and private fields](#public-and-private-fields).                                     |
| What a "wine" is          | **A cuvée**: producer + wine name ("Las Jaras" + "Glou Glou"), independent of vintage. Vintage lives on the tasting.                                                       |
| Where cuvée facts come from | **An LLM lookup with web search**, run once per cuvée and stored. Wine has no IGDB. See [Why an LLM resolver](#why-an-llm-resolver).                                     |
| Who can trigger a lookup  | **The owner only**, rate-limited. It costs money per call. Visitors search what is already stored.                                                                         |
| LLM anywhere else         | **No.** Similarity, the verdict and stats are deterministic math over stored facts. Same line the recommendations spec draws.                                              |
| Rating                    | **Overall on the game library's S to F tiers**, plus two optional sub-scores. See [Ratings](#ratings).                                                                     |
| Recommend or skip         | **Similar wines first; a verdict only once there is enough data to back it.** See [The verdict](#the-verdict).                                                            |
| First phase               | **A resolver spike with an eval**, before any migration or UI. See [Phases](#phases).                                                                                      |

## The two knowledge layers

A query can be answered at two levels, and the design keeps them separate on purpose.

**The reference layer** describes grapes, regions, styles and label terms: "Sangiovese",
"Chianti Classico", "Kabinett", "Extra Dry". It is the artifact's ~120 entries, curated by hand,
static, and the same for every user. It answers "what does this word on the label mean?".

**The catalog layer** describes specific wines: "Las Jaras Glou Glou", "Château Musar Rouge". A
label like Glou Glou carries no grape and no region, so no reference entry matches. The reference
layer cannot grow to cover it, because there are millions of cuvées. The catalog is filled on
demand: the first search for a cuvée resolves it, and every later search reads the stored row.

**A catalog row points into the reference layer.** Glou Glou's row lists its grapes and its
region as reference entries where they exist, and that link is what makes everything downstream
work. A cuvée inherits a profile it can be compared with, the stats can group by grape, and the
detail view can show the reference card for each grape in the blend.

A search runs against both layers and merges the results. Catalog hits come first, then reference
hits, then a **Look it up** action when nothing in the catalog matches.

## Why an LLM resolver

Options for "turn a cuvée name into facts", considered:

| Source                                | Verdict                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vivino                                | No public API. Scraping breaks its terms.                                                                                                        |
| Wine-Searcher API                     | Paid, priced for businesses, and returns prices more than structure (sweetness, body).                                                           |
| Open datasets (X-Wines, Kaggle dumps) | Static snapshots weighted toward big brands. A small natural-wine producer like Las Jaras is unlikely to be in them. **Confirm before ruling out.** |
| Hand entry only                       | Always works, but turns every shop search into a data-entry task, which is the thing the tool exists to avoid.                                  |
| **Claude + web search**               | Finds producer pages, importer tech sheets and reviews for small producers, and returns the structured shape directly. Costs cents per lookup.   |

The resolver's weakness is that it can be confidently wrong. The design answers that four ways:

- **Every resolved row stores its sources** (URLs from the search results) and a confidence
  level, and the UI shows both.
- **The owner confirms a match before it becomes a row.** A lookup returns candidates; nothing is
  stored until one is picked. This also handles ambiguity ("Glou Glou" vs. a different producer's
  wine with a similar name).
- **Rows are editable by the owner.** A wrong blend is a correction, not a support ticket.
- **The structural scores are bounded.** Sweetness, body, acidity and tannin go on the same 1 to 5
  scales as the reference layer, with the reference profile of the main grape as the prior. A
  score far from that prior is the thing worth a second look, and the eval measures exactly that.

## Data model

Proposed tables. Column lists are illustrative; hardening settles names and types.

### Reference layer

**Where it lives is the first decision to harden.** Two options:

- **(a) A typed TS module** (`src/lib/wineReference.ts`), as the artifact had it. Searching it
  is client-side and instant, works with no backend, and phase 1 can ship with nothing else.
- **(b) A seeded Postgres table** (`wine_reference`). Needed if SQL stats are to group by grape or
  region and show the reference name, and needed for a catalog row's foreign key.

Proposal: **both, with one source of truth.** The data is authored in a JSON file under `api/`,
seeded into `wine_reference` by migration or script, and exported to the frontend at build time.
That keeps foreign keys real and the client search instant. A test fails if the two drift.

Shape per entry, carried over from the artifact: `id` (slug), `kind` (`grape`, `region`, `style`,
`term`), `name`, `aka[]`, `color`, `country`, sweetness range `[lo, hi]`, `body`, `acidity`,
`tannin` (1 to 5), `taste`, `pairing`, `tip`, `more`, `similar[]`, the `grapes[]` a region is made
from, and the `ladder` a term sits on.

_Gaps to fill before shipping:_ the artifact has no orange or skin-contact wine, pét-nat, or
natural or low-intervention wine as styles. A chillable natural red like Glou Glou has no style
entry to point at. The content was AI-written and will be published under my name, so it needs a
proofread pass too.

### `wines`: the catalog

| Column                                       | Notes                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `id`                                         | uuid                                                                                                            |
| `producer`, `name`                           | "Las Jaras", "Glou Glou". Unique on their normalized form (lowercase, unaccented, punctuation stripped).        |
| `color`                                      | red, white, rosé, orange, sparkling, sweet/fortified                                                            |
| `style_tags[]`                               | chillable, natural, oaked, carbonic, pét-nat, skin-contact … from a closed vocabulary                           |
| `country`, `region_ref`, `appellation`       | `region_ref` is a FK into the reference layer where one matches; `appellation` keeps the precise label wording |
| `sweetness`, `body`, `acidity`, `tannin`     | 1 to 5, typical for the cuvée                                                                                   |
| `abv_typical`                                | nullable                                                                                                        |
| `summary`                                    | two or three sentences in the reference layer's voice                                                           |
| `sources` (jsonb)                            | `[{url, title}]` from the lookup                                                                                |
| `confidence`                                 | `high`, `medium`, `low`, as the resolver reported it                                                            |
| `resolved_by`                                | `llm`, `manual`, `llm+edited`                                                                                   |
| `resolver_model`, `resolved_at`              | so a bad batch can be found and re-run                                                                          |
| `created_by_user_id`                         | `ON DELETE SET NULL`, as `game_metadata` does                                                                   |

**`wine_grapes`** (`wine_id`, `grape_ref` or free-text `grape_name`, `share_pct` nullable). The
blend is its own table because it is a list, and stats group by it. A grape with no reference
entry is stored by name, so an obscure grape never blocks a lookup.

_Vintage variation:_ blends and structure move year to year, especially for small natural
producers. The catalog stores the **typical** cuvée. A tasting can override the blend for its
vintage later; v1 does not.

_Shared or private catalog rows:_ the game catalog shares a row only when it has a canonical
external key (`igdb_id`). Wine has none, so by that rule every row would be private. In a
single-user v1 the question does not bite. Hardening should decide it before multi-user, because
the answer decides whether one user's edit can change another user's wine.

### `wine_tastings`: the log

One row each time I drink a wine, so a wine I keep buying has a history, like `play_sessions`.

| Column                 | Public? | Notes                                                   |
| ---------------------- | ------- | ------------------------------------------------------- |
| `id`, `user_id`, `wine_id` | yes |                                                         |
| `tasted_on`            | yes     | date                                                    |
| `vintage`              | yes     | nullable (NV wines, or I did not note it)               |
| `rating`               | yes     | S, A, B, C, F; nullable for "had it, not rating it"     |
| `value_score`          | yes     | 1 to 5, optional sub-score                              |
| `buy_again`            | yes     | yes / no / null, optional sub-score                     |
| `price_paid`, `where_bought` | **no** | private                                              |
| `notes`                | **no**  | private, the `game_notes` rule                          |

**What the library shows per wine** is derived, not stored: the latest tasting's rating, the
number of tastings, and the last date. Whether "latest" or "best" or "mean" is the right summary
rating is a hardening question.

### Want-to-try list

A wishlist analogue (`wine_wishlist`: `user_id`, `wine_id`, `added_at`, private `notes`). Not
needed for any of the three jobs, so it is a late phase. The shop flow makes it natural: "not
today, but remind me".

## Ratings

**Overall: reuse the game library's tiers** (`RATINGS` in `src/lib/games.ts`: Perfect, Great, Good,
Okay, Bad). Consistency across the site, a vocabulary already learned, and the colour tokens
already exist. The cost: five levels are coarse for stats that average. Mapped to 5 to 1, a mean
is still meaningful across dozens of wines, which is the scale this library will reach.

**Sub-scores, two, both optional:**

- **Value for money** (1 to 5). Changes a decision in the shop: a B at $15 and a B at $60 are not
  the same recommendation.
- **Buy again** (yes / no). The most direct answer to "should I get this again?", and different
  from rating: an A I would not pay for again is real.

The test for any further sub-score is "would it change a decision in the shop, or a stat I would
read?". Tasting axes (my perceived sweetness, body and so on) were considered. They are
interesting, because the gap between what I perceived and what the catalog says is how a palate
calibrates, but they cost four inputs per tasting. **Listed as an open question, not proposed.**

## Similarity

Everything in "compared with my library" runs on one distance between two wines, and it must
work between a catalog wine and a reference entry too (searching "Gamay" should still list the
Gamays I have had).

**Feature vector per wine**, built from stored facts only:

- `color`, one-hot
- sweetness, body, acidity, tannin, scaled to 0 to 1 (a reference entry's sweetness range uses
  its midpoint)
- grapes, multi-hot weighted by `share_pct` (equal shares when unknown)
- region, as a hierarchy: same appellation > same region > same country
- `style_tags`, multi-hot

**Distance** is a weighted sum of per-block distances, with block weights as named constants.
Starting weights are a guess; structure and grape should dominate, country should barely count.
At library scale (hundreds of wines at most) this is a loop, not an index, and it runs in the
API, not offline; contrast the recommendations spec, whose candidate pool is all of IGDB.

**Output for a search result:** the k nearest wines I have tasted (proposal: 3), each with its
rating and a one-line reason templated from the closest block ("same grape", "same region",
"similar weight and acidity"). No LLM writes these.

## The verdict

The question asked in the shop is "will I like this?". The honest answer depends on how much
data exists, so the proposal is two stages:

1. **Always: the nearest wines I have had**, with ratings. Honest at any library size, and it
   leaves the judgment to me.
2. **Gated: a predicted tier**, the similarity-weighted mean of the k nearest ratings, shown only
   when both hold: at least N rated wines in total (proposal: 15), and the nearest neighbour
   within a distance threshold. Below either bar, the verdict is simply absent, not a weak guess.

_Against shipping the verdict at all:_ it can make the nearest wines feel like supporting detail
when they are the real evidence, and an opinionated "skip" on a wine I would have loved is a cost
the nearest-wines view never pays. The eval below can measure whether it beats "mean of
everything I've rated", and if it does not, it does not ship.

## Why the lookup is a call and not a batch

The recommendations spec ran its maths offline because it was heavy and could wait a day. A shop
lookup can wait about 30 seconds, and it is one network-bound request, not CPU work. So the
resolver runs in the API function on request.

**Latency is the constraint to verify first.** A Claude call with a few web searches plausibly
takes 10 to 40 seconds. The Vercel Python function's maximum duration on the current plan must
cover that with headroom. `vercel.json` sets none today. If it cannot, the fallback is an async
shape: the POST creates a pending lookup row and returns, and the client polls. That is more
moving parts, so it is the fallback, not the plan.

## The resolver

`POST /api/wine/me/lookups` with `{query}`. Owner-only, uncached, rate-limited through the
existing `services/rate_limit.py` (proposal: 20 per hour, 100 per day).

**One Claude request**, with:

- **Model:** a config constant. The default is `claude-opus-5-5` ($4 / $20 per million input /
  output tokens). The eval in phase 0 compares it with `claude-sonnet-5-5` ($2 / $10) and
  `claude-haiku-5-5` ($0.10 / $0.50). A lookup is a classic case where a cheaper model may hold
  quality, but that is measured, not assumed. Effort set explicitly, starting at `low`.
- **Tools:** the server-side `web_search_20260209` tool, `max_uses` capped (proposal: 4), and a
  `blocked_domains` list if a source proves unreliable.
- **Output:** structured, to a JSON schema of up to 3 candidates, each with the `wines` fields,
  the blend, reference ids where the model can map them (from a list given in the prompt), a
  confidence, and the source URLs. **Verify in phase 0** that structured output
  (`output_config.format`) combines with web search in one request. Citations are documented as
  incompatible with `output_config.format`, and web search returns cited text. If it does not
  combine, the fallback is a strict custom tool (`submit_candidates`, `strict: true`) the model
  is told to call when done, or a second request with no tools to extract the schema.
- **System prompt:** fixed text plus the reference id list, so it is prompt-cached across lookups.
  Nothing per-request goes before the cache breakpoint.
- **Refusals and failures:** check `stop_reason`, and treat a refusal, a timeout or an empty
  candidate list as "not found". The UI then offers manual entry with the query prefilled. A
  failed lookup never blocks logging a wine.

**Cost, as an estimate to replace with measurement:** a lookup reading a few search results is on
the order of 20,000 to 40,000 input tokens, so roughly $0.10 to $0.20 on Opus 5.5 before
search fees, half that on Sonnet 5.5, and a cent or two on Haiku 5.5. Web search is billed per
search on top; confirm the current rate on the pricing page. At a few lookups a week, every
option is small; the rate limit exists for a stolen session, not for normal use.

**Confirming a candidate:** `POST /api/wine/me/wines` with the chosen candidate. The server
re-validates every field against the schema, maps reference ids, and dedupes on the normalized
producer + name. A duplicate returns the existing row rather than creating a second one.

_Why the client sends the candidate back rather than a lookup id:_ the game library rule is that
a shared row never trusts the payload. That rule protects other users from one user's input. In
a single-user v1, whatever the owner sends is the owner's own data, and storing lookups
server-side just to avoid trusting the owner is cost for nothing. **This must be revisited if
catalog rows become shared.** Listed under open questions.

## API

Under a new router prefix, `/api/wine`, mirroring the library's layers (router → service →
repository) and its read/write split, as laid out in `docs/architecture.md`.

### Reads (public, cached)

- `GET /api/wine/users/{username}/tastings`: every tasting with its wine and blend, public fields
  only. One payload for the whole library; filter, group and sort are client-side, as
  `pipeline.ts` does for games.
- `GET /api/wine/search?q=`: catalog search (Postgres `unaccent` + trigram on producer and name).
  Public, cached briefly. Reference search stays client-side.

Each read gets a cache tag in a new `wineApi.ts` (server-only, like `libraryApi.ts`), paired with
every write that changes it.

### Writes (owner-only, `/me`)

- `POST /me/lookups` (the resolver, above)
- `POST /me/wines`, `PATCH /me/wines/{id}` (confirm a candidate, manual entry, corrections)
- `POST /me/tastings`, `PATCH /me/tastings/{id}`, `DELETE /me/tastings/{id}`
- `GET /me/tastings/{id}` for the private fields, the `GET /me/wishlist/{id}` pattern

Writes go browser → Server Action → `meApi.ts` → `/me`, and revalidate the tags above.

### Public and private fields

The CLAUDE.md rule applies unchanged: the public read is cached and shared, so a private field
cannot be on it at all. `price_paid`, `where_bought` and `notes` live only on `/me` responses,
with separate DTO builders and a test in the style of `test_public_wishlist_never_carries_notes`.

### Single-user

v1 has one library, mine, at `/wine`. The schema, routes and reads take a username anyway, so
`/wine/u/[username]` and onboarding are a later phase rather than a migration. Proposal: the
"Look it up" and "Log it" affordances are gated on `useIsConfirmedOwner`, since both create rows.

## Frontend

### Routes

- `/wine`: my library and the lookup, one page. Follows the per-app-prefix lean in **Decide the
  routing/namespace strategy**. Wine is not media, so it stays out of any `/library` umbrella.
- Later: `/wine/u/[username]`, as the game library has.
- A homepage tile.

### The page

**Search-first on a phone, library-first on desktop.** The shop use case is a phone in one hand,
so the search field is the first thing on the page and sticky, as the library's `FilterBar` is.
Results replace the library view while there is a query, and clear back to it.

A result list merges three kinds of row, visually distinct:

1. **Wines in the catalog**, with "you had this: A, twice" if I have.
2. **Reference entries** (grape, region, style, term), as the artifact showed them.
3. **Look it up**, when no catalog wine matches the query well. Owner only.

**The wine detail view**, opened from a result or from the library:

- The facts: producer, name, colour, region, blend, the four structure meters, style tags,
  summary, sources and confidence.
- **Where it sits:** the artifact's ladders, for the wine's own scales.
- **Compared with my library:** the nearest wines I have had, then the gated verdict.
- **My tastings** (owner sees private fields), and **Log a tasting**.
- For each grape in the blend, a link to its reference card.

A reference entry's view is the artifact's detail sheet, restyled, plus "wines you've had" for
that grape or region.

**The library view:** the wines I have had, grouped and sorted through a pipeline in the style of
`pipeline.ts` (by colour, grape, region, rating, last tasted). The visual form is the next
section.

**Stats:** a panel in the style of `StatsPanel.tsx`: rating distribution; mean rating by grape,
region, country, colour and style tag (with counts, and a minimum count before a group shows);
rating against price; tastings over time; and "what I like", the structure profile (sweetness,
body, acidity, tannin) of my A and S wines against my C and F wines. Optionally the wine tables
join the SQL tab (`queryTables.ts`).

### Look and feel

The game library sets the site's look, so this should read as its sibling, not a copy and not a
stranger:

- **Objects on wood.** The library as a **wine rack**: bottles seen end-on or as standing labels,
  on the same baked wood grain (`public/shelf/*.webp`, `scripts/wood-grain/`). A new grain profile
  for a rack is cheap: edit a profile, run `npm run grain`.
- **No label art to show.** Games have cover art; wines have nothing reliable. A bottle's face is
  generated: colour from the wine colour token, producer and name typeset. This is a design task in
  itself and the riskiest part of the look.
- **A detail card that flies out**, like `GameDetailCard.tsx`, for continuity.
- **Tokens, both schemes.** Wine colours (red, white, rosé, orange, sparkling, sweet) become
  tokens in `globals.css` for light and dark. The accent stays `--link`; no literals.

**The reuse question to decide early:** `shelves/`, `GameCase.tsx` and the detail card's flight
are written for games only (the music-wall entry found the same). Either generalize them over an
item type, or build wine siblings that copy the patterns. Generalizing is the better end state and
the more expensive start; it also risks the game library, which is the site's most important page.
Proposal: **siblings first**, extract shared pieces once there are two working users of each.

## Evaluation

Phase 0 is an eval, as in the recommendations spec, because the resolver is the part most likely
not to work.

- **A labelled set of 30 or so real labels**, chosen to be hard: small natural producers (Glou
  Glou), labels with no grape or region, well-known châteaux, a few non-wines and typos, and two
  cuvées with similar names. Each with hand-verified facts: blend, region, colour, and structure
  scores I agree with.
- **Metrics:** right wine picked as the top candidate; blend correct (grapes, ignoring
  percentages); region correct; each structure score within 1 of the label; "not found" when it
  should be; latency; cost per lookup.
- **Run per model** (Opus 5.5, Sonnet 5.5, Haiku 5.5) at one or two effort levels.

**Exit criterion:** a model that picks the right wine for at least 90% of the set, gets blend and
region right for at least 80%, and answers inside the function's time limit. The cheapest model
that clears it wins. If none does, the plan changes before any table exists: manual entry with an
"autofill" button rather than lookup-first.

The verdict gets its own evaluation in phase 5, once real ratings exist: leave-one-out over my
rated wines, predicted tier against actual, compared with the baseline "my mean rating".

## Testing

- **Reference data:** the JSON and the frontend export agree; every `similar` and `grapes` id
  resolves; every entry has the fields its kind requires.
- **Resolver (pytest, no network):** the request is built as specified (model, tools, cache
  breakpoint); schema validation rejects out-of-range scores and unknown reference ids; refusal,
  timeout and empty answers become "not found"; the rate limit applies.
- **Catalog:** normalized dedupe ("Las Jaras / Glou-Glou" and "las jaras glou glou" are one row).
- **Similarity and verdict:** distance properties (identical wines are 0; the same grape is closer
  than the same country); the verdict is absent below either bar.
- **Public fields:** no public payload carries price, shop or notes.
- **Frontend (`node --test`):** search merging and ranking, the pipeline, the stats aggregations.

## Docs to update when this lands

Per the ownership rule in `CLAUDE.md`: the new tables in `api/README.md`'s data model; the read
and write paths plus the resolver call in `docs/architecture.md`; the Anthropic API key and the
function duration in `docs/deployment.md`; new rows in `CLAUDE.md`'s "Where things live" and
"Routes" tables; the Bruno collection.

## Phases

0. **Prove the resolver.** A script, the labelled set, the per-model eval and the structured
   output check. No migration, no UI. **Exit criterion** as above.
1. **Reference and lookup page.** The reference data in its home, client-side search, the
   reference detail view, at `/wine`, in the site's style. Useful on its own and needs no new
   backend.
2. **Catalog and resolver.** `wines`, `wine_grapes`, the lookup and confirm endpoints, manual entry,
   the wine detail view. Search now finds bottles like Glou Glou.
3. **Log and rate.** `wine_tastings`, Log a tasting from any wine view, the private fields.
4. **The library view.** The public read, cache tags, the rack and the detail card flight.
5. **Compared with my library.** Similarity and nearest wines, then the verdict behind its gate and
   its evaluation.
6. **Stats.**
7. **Later, each optional:** want-to-try list; photo of the label as input (the same resolver with
   an image block, which Claude reads directly, so cheap once phase 2 exists); other users'
   libraries.

## Open questions

- **Function duration.** What the Vercel plan allows for the Python function, and whether the
  resolver fits it. Decides sync vs. async.
- **Structured output with web search** in one request, or the fallback.
- **Shared catalog rows.** If other users arrive, do they share Glou Glou's row, who may edit it,
  and does the confirm endpoint then need server-side lookup ids rather than trusting the payload?
- **Library summary rating** when a wine has several tastings: latest, best or mean.
- **Tasting-axis sub-scores** (perceived sweetness and so on): worth four inputs per tasting?
- **Open datasets:** check X-Wines and similar for coverage and licence before settling on the LLM
  as the only source.
- **Terms:** storing summarized facts plus source links should be fine; confirm nothing copies a
  source's text wholesale.
- **Is a wine log public by default?** Drinking history is more personal than games. A
  private-library switch may want to exist before launch.

## Explicitly not in v1

- An LLM in any role other than resolving a cuvée: no generated recommendations, explanations or
  tasting notes.
- Per-vintage blends and scores.
- Prices, availability, or "where to buy".
- Cellar inventory (bottles I own and when to drink them). A different product; CellarTracker
  does it.
- Barcode scanning.
- Generalizing the game shelf code (siblings first, per Look and feel).
