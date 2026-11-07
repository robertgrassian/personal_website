# Tech spec: in-season produce tracker

Status: **proposed**, 2026-11-07. Not started. Awaiting review of [Decisions for review](#decisions-for-review).

A page that shows what fruit, vegetables and herbs are in season where you are, this month, and
lets you check off what you've eaten. Whimsical and hand-drawn in look, with no AI art anywhere.

## The v1 promise, in one paragraph

Open `/produce`, land on your state's page (located from your IP, changeable), and see this
month's produce in four groups: **at its peak**, **just arrived**, **last chance**, and **also
around**. Tap anything for its season across the year. Tap **I ate this** to stamp it. A small
basket counts how many of this month's in-season items you've tried this year. Browsing works for
everyone, logged in or not. Tracking works logged out on the device and logged in across devices.

## Decisions for review

Each has a recommendation. The rest of the spec assumes the recommendation, so a different answer
means editing the section it points to.

| #   | Question                          | Recommendation                                                                                                                                                                                                                                                    | Section                           |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| D1  | Route                             | **`/produce`**, with per-state pages at `/produce/[state]` (`/produce/ny`). `/in-season` reads nicer but is longer and less obvious in a URL bar.                                                                                                                 | [Routes](#routes)                 |
| D2  | Where seasonality data comes from | **Our own curated dataset** in typed TS modules, cross-referenced from public sources, with a validator test. There is no open API (below).                                                                                                                       | [Data](#data)                     |
| D3  | Regional granularity              | **Data keyed by region; a region is a group of states; URLs are by state.** v1 ships two regions: **Northeast** (Robert lives in NYC) and **California**. Other states get an honest "not covered yet" page.                                                      | [Regions](#regions)               |
| D4  | Time granularity                  | **Month**, with four levels: out, available, **peak**, and from **storage**. Half-month (what Seasonal Food Guide uses) doubles curation for little visible gain.                                                                                                 | [Season strings](#season-strings) |
| D5  | Tracking identity                 | **Hybrid**: logged out tracks in `localStorage` with honest "saved on this device" copy; logged in tracks in Postgres; signing in offers to bring the device's checks over. Login-only is the simpler fallback if guest mode feels like scope creep.              | [Tracking](#tracking)             |
| D6  | What "eaten" means                | **Per calendar year.** One row per (user, item, year), so the page answers "this year" and "ever" from the same data, and the basket resets each January.                                                                                                         | [Data model](#data-model-phase-4) |
| D7  | Is the log public                 | **Private in v1.** Owner-only `/me` reads, never cached, no cache tags. A public "Robert has tried 41 things this year" is a cheap later phase.                                                                                                                   | [API](#api-phase-4)               |
| D8  | Art direction                     | **Ship the page on code-drawn hand-drawn chrome with no per-item art, and run an art spike in parallel** (pixel sprites vs. ink drawings, six items each, drawn by Robert). Each item has an `art` slot that falls back to a lettered "seed packet" until filled. | [Look and feel](#look-and-feel)   |
| D9  | Item blurbs                       | **Optional field, blank by default, written by Robert over time.** Not AI-drafted, to keep with the spirit of no AI art. Nothing renders when it's blank.                                                                                                         | [Catalog](#catalog)               |

## Why no API

Researched 2026-11-07:

- **Seasonal Food Guide** (seasonalfoodguide.org, by FoodPrint / GRACE Communications) has exactly
  the right shape: 50 states, half-month steps. It publishes **no API and no data license**. It
  says it compiled from NRDC, USDA, state extension offices and state agriculture departments.
  Using it as one cross-reference is fine; copying its tables wholesale is not.
- **USDA SNAP-Ed's Seasonal Produce Guide** is public domain but national and by season, so it's
  too coarse to drive the page. Useful as a sanity check.
- **USDA NASS QuickStats** has state crop statistics, not consumer availability by month.
- **State extension and agriculture department harvest calendars** (Cornell, UC ANR, NY's "Pride
  of New York", and similar) are the best primary sources, one state at a time.

Facts ("NY strawberries peak in June") are not copyrightable; a source's particular table can be.
So each region is **built by us from at least two sources**, which are cited in the region file. That
also makes the data ours to correct.

## Data

All static, all in the repo, no database. The browse page needs no backend at all.

```
src/lib/produce/
  catalog.ts          every item: slug, name, category, art, blurb
  regions.ts          regions, which states each covers, time zone, sources
  states.ts           all 50 states + DC: code, name, region id or null
  seasons/
    northeast.ts      slug → season string, for one region
    california.ts
  season.ts           pure functions over season strings (status, arriving, leaving)
  season.test.ts
  data.test.ts        the validator (below)
```

**Teaching note for whoever builds it:** this is the same shape as the wood grain. The source of
truth is code, and a `node --test` validator makes a typo loud instead of silently rendering a
wrong season.

### Catalog

```ts
export type ProduceCategory = "fruit" | "vegetable" | "herb" | "mushroom";

export type Produce = {
  slug: string; // kebab-case, stable forever: it is the key stored in Postgres
  name: string; // "Ramps"
  aka?: string[]; // "Wild leeks". Display only
  category: ProduceCategory;
  art?: string; // path under public/produce/, absent until drawn
  blurb?: string; // Robert's words, optional (D9)
};
```

Roughly 100 items, the union of what any covered region grows. An item absent from a region's
season file isn't grown there and doesn't appear on that region's page. **Slugs never change once
shipped**, because Phase 4 stores them. A rename changes `name`, never `slug`.

### Regions

```ts
export type Region = {
  id: string; // "northeast"
  name: string; // "the Northeast"
  timeZone: string; // "America/New_York": decides what "this month" means
  sources: { title: string; url: string }[];
};
// states.ts
export type UsState = { code: string; name: string; region: string | null };
```

v1 Northeast covers **NY, NJ, CT, MA, RI, VT, NH, ME, PA**. California covers **CA**. Every other
state has `region: null` until a region is curated for it. Regions are an internal grouping: users
only ever see their state, plus a quiet "season data for the Northeast" line under it. That way a
state can later get its own region file without any URL changing.

### Season strings

One 12-character string per item per region, January first:

| Char | Meaning                                            |
| ---- | -------------------------------------------------- |
| `.`  | Out of season                                      |
| `a`  | Available, locally grown                           |
| `P`  | Peak                                               |
| `s`  | Local, from storage (apples in February, potatoes) |

```ts
// seasons/northeast.ts
export const northeast: Record<string, string> = {
  strawberry: ".....PPa....",
  apple: "ssss...aPPPs",
  ramps: "...aP.......",
};
```

Why a string and not twelve objects: one item reads on one line, a diff of a season change is one
line, and the alphabet makes the validator trivial.

### The validator (`data.test.ts`)

Fails the test run if:

- a season string isn't 12 chars from `.aPs`, or is all `.`;
- a season file names a slug not in the catalog;
- a catalog slug isn't kebab-case, or is duplicated;
- a state names a region that doesn't exist, or a region has no states;
- the state list isn't exactly the 50 states + DC;
- a region has fewer than two sources;
- an `art` path doesn't exist under `public/`.

### Season logic (`season.ts`)

Pure functions, no React, tested with `node --test`:

```ts
type Status = "out" | "available" | "peak" | "storage";
statusIn(season: string, month: number): Status; // month 0..11
isArriving(season, month): boolean; // in now, out last month (wraps Dec → Jan)
isLeaving(season, month): boolean; // in now, out next month (wraps)
currentMonth(timeZone: string, now: Date): number; // Intl.DateTimeFormat, not getMonth()
```

**Grouping for a month:** peak → **At its peak**. Arriving (and not peak) → **Just arrived**.
Leaving (and not peak or arriving) → **Last chance**. Remaining available or storage → **Also
around**. Each item lands in exactly one group, and the tests assert that. Wrap-around is the bug
magnet: citrus `PPa.......aP` must be "arriving" in November and "leaving" in March.

### Curation process (per region)

An agent can do this, one region per PR:

1. Pull the region's states' extension and agriculture-department harvest calendars plus SNAP-Ed
   and Seasonal Food Guide as cross-checks. Record them in `sources`.
2. Where sources disagree, take the majority, and widen to `a` rather than claim `P`.
3. Robert spot-checks ten items he knows from that region's markets before merge. **This is the
   review gate for data, and the PR description lists the ten.**

## Routes

| Route              | Rendering                        | What it does                                                                |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| `/produce`         | Middleware redirect, else static | Sends you to your state's page; if it can't tell, renders a state picker    |
| `/produce/[state]` | Static + ISR (1 hour)            | The page. `generateStaticParams` over all 51 codes; `dynamicParams = false` |

Top-level, kebab-case, per the per-app-prefix lean in the routing strategy backlog entry. Produce
is its own app, not part of the game library, so it does not go under `/video-games`.

### Resolving the state (middleware, Phase 2)

`src/middleware.ts` already runs on every page, so the redirect costs no extra hop. For
`/produce` only:

1. A `produce_state` cookie holding a valid code → **307** to `/produce/{code}`.
2. Otherwise, if `x-vercel-ip-country` is `US` and `x-vercel-ip-country-region` is a known state →
   307 there.
3. Otherwise fall through and render the static picker page. This covers local dev (Vercel sets
   no geo headers locally), non-US visitors, and VPNs.

The cookie is written **only when someone explicitly picks a state** (a Server Action, a plain
non-HttpOnly cookie, 400 days, `SameSite=Lax`), so a guess from geolocation is never pinned.
Visiting `/produce/ca` directly never redirects: a shared link shows what was shared.

Why a redirect to a state URL and not reading geo inside the page: reading headers in a Server
Component makes the page dynamic, rebuilt per request. This keeps all 51 pages static and
shareable, and only the one-line hop is dynamic. It's the same trade as `src/app/library/page.tsx`.

**Verify on the first preview deploy** that the geo headers reach middleware on this project's
plan. If they don't, step 2 is skipped and everyone gets the picker, which is fine.

### "This month" on a static page

A page built at deploy time would show the deploy's month forever. So:

- `export const revalidate = 3600`. The server render computes `currentMonth(region.timeZone)`
  and passes it to the client as a prop. Worst case, the page flips over at most an hour late.
- The month scrubber is client state **initialized from that prop**. The client never computes
  "now" during render: a client-computed month would mismatch the server HTML near midnight in
  another time zone (the hydration-mismatch class of bug already in the backlog).
- The whole year's data for the region ships with the page (~100 × 12 chars), so scrubbing months
  needs no fetch.

## Look and feel

**Two scenes, one per color scheme**, which is also how this page meets the always-support-both-modes
rule:

- **Light: kraft paper and seed packets.** Warm paper background, ink lines, items as little seed
  packets or market tags.
- **Dark: the farmers-market chalkboard.** Slate background, chalk lines, the same layout.

Typography: **Caveat** (already loaded in `src/lib/fonts.ts`) for headings and hand-lettered labels,
the site's body font for anything longer than a phrase.

**Hand-drawn chrome is drawn by code, with rough.js** (MIT, small): sketchy card borders, circled
current month, underlines, the stamp. Two constraints the builder must know:

- **Use rough.js's `generator` with a fixed `seed` per element, and render path data on the
  server.** Unseeded, it's random per render, so server and client paths differ (hydration
  mismatch) and borders wobble on every re-render.
- **Not an SVG displacement filter** (`feTurbulence` + `feDisplacementMap`), the obvious
  alternative. The shelf learned that per-pixel filters re-rasterize on every zoom step and
  blanked the library for a second each time (see the wood-grain convention in CLAUDE.md).
  Path data has no such cost.

Accent color follows the site's switch: `--link`, `--accent-glow`, no literals. Page surface tokens
live in a new `src/app/produce/produce.css` under `[data-app="produce"]`, defined for both schemes.

### Per-item art: decoupled, then a spike

The page must not wait on 100 drawings. Every item renders its `art` if present, otherwise a
**lettered seed packet**: name in Caveat, a category glyph, a rough.js border, a tint from the
category. That is the Phase 2 look, and it should be good enough to ship on its own.

**Art spike (parallel to Phases 1 to 3, Robert-led, time-boxed):** draw the same six items
(strawberry, carrot, apple, ramps, tomato, basil) two ways and pick one:

| Option               | How                                                                                                           | Cost per item | Notes                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **A. Pixel sprites** | 32×32 in Piskel or Aseprite, exported PNG, rendered with `image-rendering: pixelated`. Sources committed.     | ~15 min       | Most achievable for a non-illustrator. Leans "pixel farm". Clashes a little with rough.js chrome; may want pixel chrome instead. |
| **B. Ink drawings**  | Pen on paper or iPad, scanned, cleaned, traced to SVG (potrace) so lines take `currentColor` in both schemes. | ~30 min       | Most whimsical and most personal. SVG means ink on paper in light, chalk in dark, for free.                                      |

Ruled out: **AI art** in any form. **Emoji sets** (Twemoji, Noto, OpenMoji) as the shipped art,
because they cover maybe 30 of the 100 items (no ramps, kohlrabi, fennel or garlic scapes) and read
as UI, not whimsy.

## Tracking

### Why hybrid, and why not a long-lived cookie

| Option                             | Durable                                                                                                                                                                                          | Cost                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localStorage` only                | **No on Safari.** WebKit deletes all script-writable storage (localStorage, IndexedDB, JS-set cookies) after 7 days of Safari use without visiting the site. A monthly visitor loses everything. | Free                                                                                                                                                                                                             |
| Own anonymous cookie + server rows | Yes (a server-set HttpOnly cookie isn't capped)                                                                                                                                                  | A new identity concept in FastAPI and an **unauthenticated write endpoint** that spam bots will find                                                                                                             |
| Supabase anonymous sign-in         | Yes, and it upgrades to a real account by linking an email                                                                                                                                       | The visitor becomes "signed in" site-wide: `AuthButton`, `/library` and `/onboarding` would all need an `is_anonymous` branch. Supabase recommends CAPTCHA for it. Abandoned anonymous users need a cleanup job. |
| Login only                         | Yes                                                                                                                                                                                              | Logged-out visitors can't try the best part                                                                                                                                                                      |
| **Hybrid (recommended)**           | On the device until sign-in, then yes                                                                                                                                                            | Two storage backends behind one hook                                                                                                                                                                             |

The hybrid is honest about the Safari limit in its copy ("Saved on this device. Sign in to keep it
for good.") rather than pretending a cookie fixes it.

### One hook, two backends (Phase 3)

`useTastings(year)` returns `{ tastings: Map<slug, eatenOn>, mark(slug), unmark(slug), source }`.
Components never know which backend they're on.

- **Device backend:** key `produce:v1:tastings`, value `{ "2026": { "ramps": "2026-04-18" } }`.
  Read through `useSyncExternalStore` with a **server snapshot of "nothing"**, so the static HTML
  and the first client render agree, then the checks appear. Every read and write is wrapped in
  try/catch: private windows and blocked storage throw.
- **Account backend (Phase 4):** fetched from the browser with the Supabase session's JWT, the way
  `useViewerRelationship.ts` does it, because the page is static and identical for every viewer.
  Writes go through Server Actions → `meApi.ts`, like every other owner write. Optimistic UI,
  rolled back on failure.

### Bringing device checks into an account

On the first signed-in load with device data present, show a small prompt: "Bring over the 6
things you checked off on this device?" **Prompt, don't auto-import**: on a shared computer, the
device's checks may be someone else's. Yes → one bulk import (union; the earlier date wins on a
clash) → clear the device copy. No → clear it.

## Data model (Phase 4)

One table, one Alembic migration.

### `produce_tastings`

| Column         | Type                                       | Notes                                         |
| -------------- | ------------------------------------------ | --------------------------------------------- |
| `user_id`      | `uuid` FK `profiles` **ON DELETE CASCADE** | Account deletion takes it, like the rest      |
| `produce_slug` | `text`                                     | CHECK kebab-case, ≤ 64 chars                  |
| `year`         | `smallint`                                 | CHECK 2020..2100                              |
| `eaten_on`     | `date`                                     | Defaults to today in the caller's region zone |
| `created_at`   | `timestamptz`                              |                                               |

PK `(user_id, produce_slug, year)`. **The API does not validate slugs against the catalog**: the
catalog is a TS module the Python function can't import, and an unknown slug in your own private
log harms nothing. The client ignores slugs it doesn't know, so a slug that's been retired just
stops showing up.

**It hangs off `profiles`, so tracking requires onboarding.** That forces two fixes to auth
surfaces that are site-wide in principle but game-library-flavored in practice, both in Phase 4:

- `/onboarding` copy says "choose the handle for your game library" and always redirects to the
  library. It needs a `next` parameter (**validated as a same-origin path**, or it's an open
  redirect) and neutral copy.
- The sign-in entry is `/video-games/start`. Produce needs to start sign-in with `next=/produce/…`.
  The builder first reads `src/app/auth/*` to see whether a `next` survives the OAuth round trip,
  and adds it if not.

## API (Phase 4)

Under the existing `API_PREFIX` (`/api/library`). The prefix's comment says it names the app,
which these endpoints make slightly untrue. Renaming it touches `apiPrefix.ts`, `config.py`,
`next.config.ts` and the middleware matcher in lockstep, and isn't worth it for one app. Revisit
if a third app arrives (noted in the routing backlog entry).

| Method + path                               | Body / result                                           | Notes                                |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| `GET /me/produce/tastings?year=2026`        | `[{ slug, year, eatenOn }]`                             | Never cached, no tag (owner-only)    |
| `PUT /me/produce/tastings/{year}/{slug}`    | `{ eatenOn? }` → the row                                | Idempotent upsert                    |
| `DELETE /me/produce/tastings/{year}/{slug}` | 204                                                     | 204 even if absent                   |
| `POST /me/produce/tastings/import`          | `[{ slug, year, eatenOn }]` (≤ 500) → `{ imported: n }` | Union; `LEAST(eaten_on)` on conflict |

Standard layers: `routers/produce.py` → `services/produce.py` → `repositories/produce.py`.
**Every new endpoint needs a Bruno request** in `api/bruno/`, or `test_bruno_collection.py` fails.

Server Actions in `src/app/produce/actions.ts`, mirroring `video-games/actions.ts`. **No
`revalidateTag`**: nothing about tastings is cached.

## The page (Phase 2 layout)

Top to bottom, mobile first:

1. **Heading**, hand-lettered: "What's in season". Under it, a state sticker ("New York", tap to
   change) and the quiet "season data for the Northeast" line.
2. **Month scrubber**: twelve hand-lettered months, the current one circled by rough.js.
   Scrubbing changes the groups, not the URL.
3. **Category chips**: All, Fruit, Vegetables, Herbs. Client-side filter.
4. **The basket** (Phase 3+): "You've tried 7 of the 31 things in season this month."
5. **Four groups**: At its peak, Just arrived, Last chance, Also around. Empty groups hide.
6. **Cards** in a grid: art or seed packet, name, a tiny 12-cell season strip. Tried items get an
   ink stamp.

**Card detail** opens in the site's dialog chrome (`ModalFrame` → `ModalShell`, so the mobile
viewport work comes for free; read `docs/mobile-viewport.md` before touching its position): big
art, `aka`, blurb if any, the full season strip with month labels, and the **I ate this** stamp
button (Phase 3+).

**Accessibility:** the season strip is never color alone. Peak and storage get a pattern, and the
strip has a text label like "Peak June to August, available May to September". All user-facing copy
follows the no-em-dash rule.

**Uncovered state page:** "We don't have season data for Texas yet." plus links to the covered
states. Honest, not a guess from another region.

**Homepage tile:** the grid is `grid-cols-3` with exactly three tiles. A fourth needs a layout
decision (2×2, or 4 across on desktop). Decide in Phase 2 with a screenshot of each.

**Also in Phase 2:** an OG image for `/produce` (Satori can't read the page's CSS, so draw it
directly, as the library's does), and the covered state pages in `sitemap.ts`.

## Phases

Each phase is one PR, sized for one agent session. Phases 1 to 3 need no backend.

0. **Review this spec.** Answer D1 to D9. **Art spike** starts and runs in parallel with 1 to 3.
1. **Data foundation.** `src/lib/produce/` as above: catalog, regions, states, `season.ts`, the
   validator, the Northeast and California season files with sources. No UI.
   **Exit:** `npm test` green; Robert has spot-checked ten items per region.
2. **Browse page.** Routes, middleware redirect + picker, ISR month, `produce.css` both schemes,
   rough.js chrome, seed-packet fallback, scrubber, chips, groups, card detail (no tracking),
   uncovered-state page, homepage tile, OG image, sitemap.
   **Exit:** deployed on a preview; geo redirect verified there; screenshots at phone and desktop,
   light and dark.
3. **Device tracking.** `useTastings` with the device backend, stamp button, stamps on cards,
   basket, the "saved on this device" copy.
   **Exit:** checks survive reload; private window doesn't crash.
4. **Account tracking.** Migration, API + Bruno, Server Actions, account backend, import prompt,
   onboarding `next` + neutral copy, sign-in entry from `/produce`.
   **Exit:** pytest green incl. cascade on account deletion; sign in from `/produce` lands back
   on `/produce/{state}` with checks imported.
5. **Art.** The spike's winner, filled in item by item. Can land in many small PRs; the fallback
   means any subset ships.
6. **More regions.** One region per PR, by the curation process. Parallelizable across agents.

## Testing

- `season.test.ts`: status, arriving and leaving including wrap-around, one-group-per-item,
  `currentMonth` across a time-zone boundary (23:30 UTC on Jan 31 is still January in Los Angeles).
- `data.test.ts`: the validator.
- A test for the middleware's state resolution as a pure function (cookie beats geo, unknown
  codes fall through, non-US falls through), extracted so it doesn't need a request.
- pytest: repository upsert/delete/import (including the earlier-date-wins rule), router auth
  (401 without a JWT), the cascade on account deletion.

## Docs to update when this lands

- `.claude/CLAUDE.md`: Routes table (`/produce`, `/produce/[state]`), Where-things-live rows for
  `src/lib/produce/`, the produce page, and tracking.
- `docs/architecture.md`: a third flow: static data + per-viewer browser read.
- `api/README.md`: `produce_tastings` in the data model.
- `README.md`: one line on what the produce page is.
- The routing-strategy backlog entry: a second app has arrived, and option (a) held.

## Open questions

- **Which Northeast states really share a calendar.** Maine and New Jersey differ by weeks. If the
  spot-check says the Northeast is too wide, split it (Phase 6 machinery already supports it).
- **Calendar year vs. season year for D6.** Citrus runs December to March, so Jan 1 resets the
  basket mid-season. Calendar year is simpler and matches "this year"; flagged in case it bugs you.

## Explicitly not in v1

- **Recipes.** v2. Recommended shape when it comes: a few hand-picked links per item in the
  catalog (editorial, no API). TheMealDB is free but thin; Spoonacular and Edamam are paid and
  restrict caching.
- **Where to buy.** Probably v2 at most. The USDA Local Food Portal API (farmers markets, CSAs,
  farm stands by location, key on application) makes "markets near you" feasible; "who has ramps
  this week" is not.
- A public log or follows. D7.
- Notes, ratings or photos per tasting.
- Non-US regions.
- Half-month precision. D4.
