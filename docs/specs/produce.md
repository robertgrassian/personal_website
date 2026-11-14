# Tech spec: in-season produce tracker

Status: **agreed**, 2026-11-10. Phases 1 to 4 are built (Phase 4 on 2026-11-13) and Phase 5's
season-first view is under way; see [Phase 4 as built](#phase-4-as-built) and
[Phase 5 as built](#phase-5-as-built) for where the code differs from the text below. Every decision below is settled except D10 (a name, which blocks
nothing). The spec was checked against the code on 2026-11-10 and corrected where the code
disagreed; those corrections are marked **Checked** so they are not undone. Build order, branches
and who builds what are in [Phases](#phases).

A page that shows what fruit, vegetables and herbs are in season where you are, this month, and
lets you check off what you've eaten. Whimsical and hand-drawn in look, with no AI art anywhere.

## The v1 promise, in one paragraph

Open `/produce`, land on your state's page (located from your IP, changeable), and see this
month's produce in four groups: **at its peak**, **just arrived**, **last chance**, and **also
around**. Tap anything for its season across the year. Tap **I ate this** to stamp it. A small
basket counts how many of this month's in-season items you've tried this year. Browsing works for
everyone, logged in or not. Tracking needs signing in, with **the same login as the rest of the
site**: one account covers the game library and the produce tracker. Signing in is all it takes:
no username, no onboarding step.

## One login, many apps

The principle the identity work follows, agreed 2026-11-10. This site is one account and a set of
small apps. Signing in gets you an account for the **site**. Each app may keep its own data for
you, and creating that data is the app's own step, taken when you ask for it:

- The **game library's** per-user data is a profile: a username, a public library, a follow
  graph. You get one by choosing **Create a profile**, never as a side effect of signing in.
- The **produce tracker's** per-user data is a private list of tastings. It needs nothing but
  the account.

A signed-in visitor with no game-library profile is a normal, complete state. They see Robert's
library at `/video-games` like anyone else, with a **Create a profile** button where a signed-out
visitor sees the sign-up pitch.

## Decisions

All agreed (D2, D3, D5 on 2026-11-07; the rest 2026-11-10) except D10.

| #   | Question                                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Section                                                  |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| D1  | Route                                     | **Agreed.** **`/produce`**, with per-state pages at `/produce/[state]` (`/produce/ny`). `/in-season` reads nicer but is longer and less obvious in a URL bar.                                                                                                                                                                                                                                                                                                                                              | [Routes](#routes)                                        |
| D2  | Where seasonality data comes from         | **Agreed.** **Our own curated dataset** in typed TS modules, cross-referenced from public sources, with a validator test. There is no open API (below).                                                                                                                                                                                                                                                                                                                                                    | [Data](#data)                                            |
| D3  | Regional granularity                      | **Agreed.** **Data keyed by region; a region is a group of states; URLs are by state.** v1 ships two regions: **Northeast** (Robert lives in NYC) and **California**. Other states get an honest "not covered yet" page.                                                                                                                                                                                                                                                                                   | [Regions](#regions)                                      |
| D4  | Time granularity                          | **Agreed.** **Month**, with four levels: out, available, **peak**, and from **storage**. Half-month (what Seasonal Food Guide uses) doubles curation for little visible gain.                                                                                                                                                                                                                                                                                                                              | [Season strings](#season-strings)                        |
| D5  | Tracking identity                         | **Agreed: login-only, on one site-wide login.** No device storage and no Supabase anonymous sign-in in v1. Device tracking for guests stays an optional later phase. Sign-in and account settings move out from under `/video-games` first.                                                                                                                                                                                                                                                                | [Tracking](#tracking)                                    |
| D6  | What "eaten" means                        | **Agreed.** **Per calendar year.** One row per (user, item, year), so the page answers "this year" and "ever" from the same data, and the basket resets each January.                                                                                                                                                                                                                                                                                                                                      | [Data model](#data-model-phase-4)                        |
| D7  | Is the log public                         | **Agreed.** **Private in v1.** Owner-only `/me` reads, never cached, no cache tags. A public "Robert has tried 41 things this year" is a cheap later phase.                                                                                                                                                                                                                                                                                                                                                | [API](#api-phase-4)                                      |
| D8  | Art direction                             | **Agreed 2026-11-13.** The Field guide look (kraft paper and chalkboard, hand-lettered, rough.js chrome) with **real public-domain watercolor plates where they exist and the drawn seed-packet fallback everywhere else**, mixed freely: not every item has to match. Art is **pluggable per item, from any number of sources**. The USDA Pomological Watercolor Collection is the first source; more are looked for after the build. A Stardew-style pixel look was the runner-up and is a backlog item. | [Per-item art](#per-item-art-pluggable-sources-per-item) |
| D9  | Item blurbs                               | **Agreed.** **Optional field, blank by default, written by Robert over time.** Not AI-drafted, to keep with the spirit of no AI art. Nothing renders when it's blank.                                                                                                                                                                                                                                                                                                                                      | [Catalog](#catalog)                                      |
| D10 | Google consent-screen app name            | **Open, blocks nothing.** **Rename it from "Video Game Library" to a site-level name and re-verify, as its own step that blocks nothing.** Until then, a produce sign-in shows Google's consent screen naming the game library. Pick the new name.                                                                                                                                                                                                                                                         | [Site-wide identity](#site-wide-identity-phase-3)        |
| D11 | Does tracking need a game-library profile | **Agreed: no.** `produce_tastings` keys on the auth user, not on `profiles`. Requiring a profile would make every produce user pick a username, get a public empty game library, auto-follow Robert, and take one of the 100 `MAX_USERS` slots. See [One login, many apps](#one-login-many-apps).                                                                                                                                                                                                          | [Data model](#data-model-phase-4)                        |

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
  types.ts            Produce, Region, UsState
  states.ts           all 50 states + DC: code, name, region id or null
  regions/
    northeast.ts      ONE region, whole: name, time zone, sources, slug → season string
    california.ts
    index.ts          id → Region
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
  seasons: Record<string, string>; // slug → season string, below
};
// states.ts
export type UsState = { code: string; name: string; region: string | null };
```

v1 Northeast covers **NY, NJ, CT, MA, RI, VT, NH, ME, PA**. California covers **CA**. Every other
state has `region: null` until a region is curated for it. Regions are an internal grouping: users
only ever see their state, plus a quiet "season data for the Northeast" line under it. That way a
state can later get its own region file without any URL changing.

**One file per region, sources included.** A region's curation is then a one-file change, so two
regions can be curated by two agents at once without touching the same file. The catalog is the
only shared file, and a curator may only append to it.

State codes are stored uppercase (`NY`) and appear lowercase in URLs (`/produce/ny`).

### Season strings

One 12-character string per item per region, January first:

| Char | Meaning                                            |
| ---- | -------------------------------------------------- |
| `.`  | Out of season                                      |
| `a`  | Available, locally grown                           |
| `P`  | Peak                                               |
| `s`  | Local, from storage (apples in February, potatoes) |

```ts
// regions/northeast.ts
export const northeast: Region = {
  id: "northeast",
  name: "the Northeast",
  timeZone: "America/New_York",
  sources: [
    /* at least two, each a title and a URL */
  ],
  seasons: {
    strawberry: ".....PPa....",
    apple: "ssss...aPPPs",
    ramps: "...aP.......",
  },
};
```

Why a string and not twelve objects: one item reads on one line, a diff of a season change is one
line, and the alphabet makes the validator trivial.

### The validator (`data.test.ts`)

Fails the test run if:

- a season string isn't 12 chars from `.aPs`, or is all `.`;
- a region names a slug not in the catalog, or a catalog item appears in no region;
- a catalog slug doesn't match `^[a-z0-9]+(-[a-z0-9]+)*$`, is over 64 chars, or is duplicated;
- a state names a region that doesn't exist, or a region has no states;
- the state list isn't exactly the 50 states + DC;
- a region has fewer than two sources, a source URL that isn't `https://`, or a time zone
  `Intl.DateTimeFormat` rejects;
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

Edge cases the tests pin down, because each has two defensible answers:

- **"In" means any character but `.`**, storage included. So apples `ssss...aPPPs` are "leaving"
  in April, from storage, which is true and useful.
- **A one-month season** (`....P.......`) is both arriving and leaving. The order above decides:
  peak wins, then arriving.
- **A year-round item** (no `.`) is never arriving or leaving.
- `groupFor(season, month)` is the one exported function the page calls, returning the group or
  `null` for out of season. The three predicates stay exported for the tests.

### Curation process (per region)

An agent can do this, one region per PR. **Web research is expected here** (agreed 2026-11-10
as an exception to the usual ask-don't-search preference): the sources are the point.

1. Pull the region's states' extension and agriculture-department harvest calendars plus SNAP-Ed
   and Seasonal Food Guide as cross-checks. Record them in `sources`.
2. Where sources disagree, take the majority, and widen to `a` rather than claim `P`.
3. Never fill a month from memory alone. An item with no source support is left out of the
   region and listed in the PR description as "wanted, unsourced".
4. Robert spot-checks ten items he knows from that region's markets before merge. **This is the
   review gate for data, and the PR description lists the ten.**

## Routes

| Route              | Rendering                        | What it does                                                                |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| `/produce`         | Middleware redirect, else static | Sends you to your state's page; if it can't tell, renders a state picker    |
| `/produce/[state]` | Static + ISR (1 hour)            | The page. `generateStaticParams` over all 51 codes; `dynamicParams = false` |

Top-level, kebab-case, per the per-app-prefix lean in the routing strategy backlog entry. Produce
is its own app, not part of the game library, so it does not go under `/video-games`.

### Resolving the state (middleware, Phase 2)

`src/middleware.ts` already runs on every page, so the redirect costs no extra hop. The decision
is a pure function, `resolveProduceState({ cookie, country, region })`, returning a state code or
`null`, so it is tested without a request. For the exact path `/produce` only, and **before**
`updateSession`, so a redirect does not pay for a Supabase round trip it throws away:

1. A `produce_state` cookie holding a valid code → **307** to `/produce/{code}`.
2. Otherwise, if `x-vercel-ip-country` is `US` and `x-vercel-ip-country-region` is a known state →
   307 there.
3. Otherwise fall through and render the static picker page. This covers local dev (Vercel sets
   no geo headers locally), non-US visitors, and VPNs.

Geolocation redirects to **any** valid state, covered or not: a Texan lands on `/produce/tx` and
its honest "not covered yet" page, which is where the links to covered states are.

`/produce/NY` (uppercase) redirects to `/produce/ny` in the same middleware branch. Without it,
`dynamicParams = false` makes a hand-typed uppercase code a 404.

The cookie is written **only when someone explicitly picks a state** (a Server Action, 400 days,
`SameSite=Lax`), so a guess from geolocation is never pinned. **A Server Action and not
`document.cookie`**, although nothing about the value is secret: Safari caps a script-written
cookie at 7 days, and a server-set one is not capped. The picker is a list of plain links to
`/produce/{code}`; the action runs on the "tap to change" control, which is the explicit pick.
Visiting `/produce/ca` directly never redirects: a shared link shows what was shared.

Why a redirect to a state URL and not reading geo inside the page: reading headers in a Server
Component makes the page dynamic, rebuilt per request. This keeps all 51 pages static and
shareable, and only the one-line hop is dynamic. It's the same trade as `src/app/library/page.tsx`.

**Verify on the first preview deploy** that the geo headers reach middleware on this project's
plan. If they don't, step 2 is skipped and everyone gets the picker, which is fine.

### "This month" on a static page

A page built at deploy time would show the deploy's month forever. So:

- `export const revalidate = 3600`. The server render computes `currentMonth(region.timeZone)`
  and passes it to the client as a prop.
- The month scrubber is client state **initialized from that prop**. The client never computes
  "now" during render: a client-computed month would mismatch the server HTML near midnight in
  another time zone (the hydration-mismatch class of bug already in the backlog).
- **Checked: the hour is not a bound, so the client corrects after mount.** ISR serves the stale
  page to the first visitor after expiry and regenerates behind them. On a page nobody has opened
  since the 12th, the first visitor on the 3rd of next month gets last month. So one effect, after
  hydration, computes `currentMonth(region.timeZone, new Date())` and, if it differs from the prop
  and the visitor has not touched the scrubber, moves the scrubber to it. An effect cannot
  mismatch hydration. ISR stays so the corrected case is rare rather than monthly.
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
- **Checked: rough.js stays out of the browser bundle.** Path strings are generated in Server
  Components (or at module scope of a server-only file) and handed down as props. Import it from
  a file that imports `server-only` so a client import fails the build.
- **Checked: the server does not know how big a card is,** and a rough border is drawn in
  pixels. Draw each border in a fixed `viewBox` and stretch it over the card with
  `preserveAspectRatio="none"` and `vector-effect: non-scaling-stroke`, so the line keeps its
  weight while the shape follows the card. Generate a small set of variants (about six seeds) and
  assign one per card by a hash of the slug, so a hundred cards are not a hundred paths and
  neighbours do not match.
- **Not an SVG displacement filter** (`feTurbulence` + `feDisplacementMap`), the obvious
  alternative. The shelf learned that per-pixel filters re-rasterize on every zoom step and
  blanked the library for a second each time (see `scripts/wood-grain/README.md`).
  Path data has no such cost.

Accent color follows the site's switch: `--link`, `--accent-glow`, no literals. Page surface tokens
live in a new `src/app/produce/produce.css` under `[data-app="produce"]`, defined for both schemes.

### Per-item art: pluggable sources, per item

**Decided 2026-11-13, after mockups of three looks (Field guide, a Stardew-style pixel farm, a
two-ink print look) and a trial of real plates on the Field guide packet.** The page must not wait
on 127 images, and the picture for one item must not depend on where another item's came from. So:

- **Every item renders its art if it has some, otherwise the lettered seed packet** (name in
  Caveat, a category glyph, a rough.js border). Any subset ships. A packet with a plate beside a
  packet with a drawn glyph is intended, not a gap to close.
- **Art is a registry of sources, not a field on the catalog.** Each source is a manifest mapping
  slugs to an image and its provenance; a priority order across sources picks one per item. Adding
  a dataset later, or building one, is one new manifest and one line in the order, with no change
  to a component. Per-item overrides come from the priority order, not from editing the catalog.
- **Every image records its source and licence beside it**, and the validator fails an image that
  lacks either, or whose file is missing.
- **The page credits its sources in one short line at the bottom**, each with a link (for example
  "Illustrations from the USDA Pomological Watercolor Collection"). It lists every registered
  source, not only those on screen, so it is a plain map over the registry and a new source
  credits itself. No per-page filtering and no sources route: Robert asked not to over-build what
  is shown. The collection is public domain and needs no credit; it is given because the source
  deserves it.
- **No tint behind a plate.** The plate's own paper is the colour. On the packet it is multiplied
  into the packet colour with its edges feathered, so it reads as painted on the packet. The
  category tint stays behind the glyph fallback only. A soft blue and the old pink were both tried
  and rejected. In dark mode multiply cannot work on slate, so the plate keeps its cream paper.
- **Plates are cropped to the specimen.** A plate is a full sheet with a cut section and the
  collector's handwriting; the card wants the whole fruit and nothing else.

#### Sources, and what was verified

| Source                                                                          | Verdict                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **USDA Pomological Watercolor Collection** (Commons)                            | **In use.** Files marked Public domain on Wikimedia Commons, named `Pomological Watercolor POMnnnnnnnn.jpg`. Strong for fruit: roughly 3,900 apple hits, 460 pear, 14 cranberry. **Nothing for vegetables, herbs or mushrooms.** The first three plates are Buckskin apple, Coles Winter pear, Howes cranberry |
| Public-domain botanical archives (BHL, NYPL, Smithsonian Open Access, Rawpixel) | **Not yet checked.** Recalled, not verified: confirm each licence and its vegetable coverage before relying on it. Looked at after the build, through the registry above                                                                                                                                       |
| Shutterstock, Adobe Stock                                                       | Paid libraries. The only listed route to a matching set of hand-drawn vegetables, at a cost and under licence terms that need reading for web use. Previews are watermarked, so none were tried. If used, buy one set by one artist                                                                            |
| Pinterest                                                                       | An aggregator: every pin belongs to whoever made it. A way to find artists, not a licence, so not a source                                                                                                                                                                                                     |

**Verified traps, so they are not hit again:**

- **A search for "pumpkin" in the USDA collection returns the _Pumpkin Sweet_ apple, not a
  pumpkin.** Three hits, none a pumpkin. Squash, beet and kale return nothing. Check what a plate
  depicts before assigning it by name.
- **Hit counts are text matches, not distinct items**: an apple's thousands are varieties and
  repeated plates.
- Commons throttles bursts of API calls. Space them out when sweeping.

Ruled out: **AI-generated art** in any form. **Emoji sets** (Twemoji, Noto, OpenMoji) as the shipped
art, because they cover maybe 30 of the items (no ramps, kohlrabi, fennel or garlic scapes) and read
as UI, not whimsy. **Stock photographs**: they read as a grocery app and their backgrounds fight
the dark scheme.

### Season-first view (Phase 5)

Wanted by Robert, 2026-11-13: **the first thing a visitor sees is broken down by season, not by
month.** The page opens on the current season (spring, summer, fall, winter) and shows what is in
season across it. Months stay as the finer grain underneath: they are what says an item is at its
peak within the season, and what a visitor drills into.

What is settled, so Phase 5 does not reopen it:

- **No data change.** A season is three months of the existing 12-character strings, so "in
  season this fall" and "peaks in October" are both derived. D4 stands: regions are still curated
  by month, and nothing is re-curated.
- **No tracking change.** The basket stays **per calendar year** (D6, reconfirmed 2026-11-13).
  `produce_tastings` is untouched. A season view shows this year's stamps.

What Phase 5 has to decide, with a recommendation for each:

- **Which months make a season.** Recommended: meteorological (March to May is spring, and so
  on), the same for every region, as a pure function in `season.ts` beside `currentMonth`.
- **What happens to the four groups.** "Just arrived" and "Last chance" are month-based and are
  how the page says ramps are about to vanish; a bare "spring" hides that. Recommended: keep the
  month as a drill-down inside the season rather than deleting it, and keep some form of the
  leaving signal on the season view.
- **Winter crosses the year end** (December to February). The view is fine; the basket resets on
  January 1 in the middle of it, which is already accepted under D6 for citrus.
- **The scrubber.** Four seasons replace twelve months as the top-level control; whether the
  months remain as a second row or only inside a season is a design call for that phase.
  **Decided: a second row.** Under the four seasons sit "All fall" (the default) and that
  season's three months.

The ISR and hydration rules in ["This month" on a static page](#this-month-on-a-static-page)
apply unchanged: the server passes the current season as a prop, and one effect corrects it.

## Tracking

**Login-only, on the site's one login (D5, agreed 2026-11-07).** A signed-out visitor who taps
**I ate this** gets a small "Sign in to keep track" prompt that goes to sign-in and comes back to
the same page, with no step in between. Supabase auth is already one `auth.users` row and one
session cookie for the whole domain, so a produce account and a game-library account are the same
account. What isn't site-wide yet is the screens around it, which
[Site-wide identity](#site-wide-identity-phase-3) fixes first.

### Options considered, so they aren't re-proposed

| Option                             | Durable                                                                                                                                                                                          | Why not, for v1                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `localStorage` / long-lived cookie | **No on Safari.** WebKit deletes all script-writable storage (localStorage, IndexedDB, JS-set cookies) after 7 days of Safari use without visiting the site. A monthly visitor loses everything. | Not durable. Kept as the optional guest phase, with honest "saved on this device" copy                                     |
| Own anonymous cookie + server rows | Yes (a server-set HttpOnly cookie isn't capped)                                                                                                                                                  | A second identity concept beside Supabase, and an **unauthenticated write endpoint** that spam bots will find              |
| Supabase anonymous sign-in         | Until the cookie is lost, then unrecoverable                                                                                                                                                     | See below                                                                                                                  |
| Hybrid (device, then account)      | On the device until sign-in, then yes                                                                                                                                                            | Two storage backends and an import step for a guest mode nobody has asked for yet. This is what the optional phase becomes |
| **Login-only (chosen)**            | Yes                                                                                                                                                                                              | Signed-out visitors can browse but not track. Accepted                                                                     |

**Supabase anonymous sign-in, in detail**, since it looked like the natural fit for one login.
`signInAnonymously()` creates a real `auth.users` row with `is_anonymous = true` and a normal
session; the JWT has the ordinary `authenticated` role plus an `is_anonymous` claim. Linking an
email (`updateUser`) or Google (`linkIdentity`, which needs manual linking enabled) later makes it
permanent under the same user id. Declined because:

- **It doesn't avoid a merge.** Linking fails when the identity already belongs to an
  account, which is exactly the returning user on a new device. That user signs into the real
  account and the anonymous user's rows have to be migrated: the same merge the hybrid needs.
- **It changes what "has a session" means everywhere.** `AuthButton`, the pre-paint `data-authed`
  flag, the `/library` resolver and `/onboarding` would all need an `is_anonymous` branch, and so
  would FastAPI's `CurrentUser`. Without that guard, `POST /me/profile` lets an anonymous session
  claim a username and a game library. Every future feature inherits the check.
- **Abuse and cleanup.** It creates users from an unauthenticated click: it must be lazy (first
  tap, never page load), Supabase recommends a CAPTCHA on it, and abandoned anonymous users need a
  scheduled delete.
- **Not reliably durable.** An anonymous user can't sign back in, so a lost session cookie loses
  the data for good. Whether Safari's 7-day cap reaches the session cookie depends on whether it
  was last written by the server (middleware refreshes it) or by browser JS. Unverified.

It fits when guests are the main audience and their data has to live on a server. Here, guests
browse and members track.

### The client side (Phase 4)

`useTastings(year)` returns `{ status, tastings: Map<slug, eatenOn>, mark(slug), unmark(slug) }`,
with `status` one of `signed-out`, `loading`, `ready`. Components never fetch directly, so the
optional guest phase can add a device backend behind the same hook without touching them.

- **Read:** from the browser with the Supabase session's JWT, the way `useViewerRelationship.ts`
  does it, because the page is static and identical for every viewer. Starts `loading` so no stamp
  flashes on or off; signed out (no session) skips the request.
- **Write:** Server Actions → `meApi.ts`, like every other owner write. Optimistic, rolled back on
  failure. `mark` sends today's date **in the region's time zone**, computed in the browser; see
  the data model for why the server cannot default it.
- **The page needs its own sign-in and sign-out control.** `AuthButton` lives in the library's
  header menu, and it is also what keeps the pre-paint `data-authed` flag honest after a
  sign-out. Phase 3 makes it usable outside the library; Phase 4 mounts it on the produce page.
- **Checked: writes are refused on preview deploys.** A preview reaches production's API, so
  `meApi.ts` blocks every write there (`targetsForeignEnvironmentApi`). Tracking is therefore
  verified locally (`npm run dev:full`) and then in production, never on a preview.

## Site-wide identity (Phase 3)

Supabase auth is site-wide; the screens around it are game-library pages. This phase makes them
the site's, and makes "signed in, no game-library profile" a state the site is comfortable in
([One login, many apps](#one-login-many-apps)). No backend changes.

What's there today (checked 2026-11-10), and what changes:

| Today                                                                                                                                                      | After                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/video-games/start` is both the sign-in page and the game library's pitch. `SignInPanel` lives beside it and its Google button hardcodes `next=/library`. | **A top-level `/sign-in`** renders `SignInPanel` with a `next` from its query string. The panel moves to `src/components/auth/` and takes `next` as a prop. `/video-games/start` **stays** (below) and passes `next="/onboarding"`: that page's button says "Start your library". |
| `/auth/callback` and `/auth/confirm` accept a guarded `next` (two copies of the guard), default to `/library`, and send failures to `/video-games/start`.  | Both call one `safeNextPath()`. Default stays `/library`. Failures go to `/sign-in?error=…&next=…`, and `/sign-in` shows the message.                                                                                                                                             |
| `/library` sends a signed-in user with no profile to `/onboarding`.                                                                                        | Sends them to `/video-games`, the same place as a signed-out visitor. Nobody is pushed into onboarding.                                                                                                                                                                           |
| `SignupCta` on `/video-games` is hidden from anyone signed in, so a signed-in visitor with no profile is offered nothing.                                  | They see **Create a profile**, linking `/onboarding`. See "The Create a profile button" below.                                                                                                                                                                                    |
| `/onboarding` bounces signed-out users to `/video-games/start` and ends at the new library.                                                                | Signed out goes to `/sign-in?next=/onboarding`. Otherwise unchanged: it **is** the game library's create-a-profile step, so its copy and its destination are already right, and it needs no `next`.                                                                               |
| Settings live at `/video-games/account`, styled with shelf tokens, linked from the library's menu and from `/privacy`.                                     | **`/account`**, on the site's own tokens (`foreground`, `subtle`, `divider`), with a permanent redirect from the old URL in `next.config.ts`. Both links updated. "Finish setting up your library" becomes "Create a game library profile".                                       |
| `AuthButton`'s sign-in item links `/video-games/start`, and its header comment says the library is the only app with sign-in.                              | Links `/sign-in?next=<current path>`. Comment corrected. It must work mounted outside `LibraryPage`, since Phase 4 puts it on the produce page.                                                                                                                                   |
| The magic-link form (development only, never rendered in production) sets no redirect, and the email template hardcodes `/auth/confirm` with no `next`.    | Carries `next` too, so the whole chain can be exercised locally where there is no Google provider: `emailRedirectTo` plus `{{ .RedirectTo }}` in `supabase/templates/magic_link.html`. Verify in Mailpit.                                                                         |

**The `next` guard.** `safeNextPath(raw, fallback)` in `src/lib/nextPath.ts`, tested. A value
passes only if it starts with a single `/`, and contains no backslash and no control character.
The backslash rule is new: browsers read `/\evil.com` as `//evil.com`. The two route handlers
are safe from that today only because they prepend an absolute origin; `/sign-in` hands `next`
to the browser as a relative URL, where it would not be.

**`next` rides in the OAuth `redirectTo`** (`…/auth/callback?next=/produce/ny`,
`encodeURIComponent`-ed), which is how `next=/library` already travels. **Checked 2026-11-10:** the
Supabase Redirect URLs are `https://rgrassian.com/**` and `https://www.rgrassian.com/**`, which
match any path and query, so nothing needs changing for production. **No preview domain is
listed**, so Google sign-in on a preview falls back to the Site URL, as it already does today
(`SignInPanel`'s comment records that failure mode). This phase is therefore verified locally,
through the development-only magic link, and then in production, not on a preview.

**The Create a profile button.** The page HTML is identical for every viewer, and the pre-paint
flag only knows a session exists, not whether it has a profile. So: a small client component,
rendered beside `SignupCta` and marked `data-hide-anon`, that renders nothing until a browser read
of `GET /me/profile` (the `useViewerRelationship` pattern) answers 404. It appears a beat after
load, only for the one kind of visitor it is for. `SignupCta` itself is untouched: its wording is
part of what Google's brand review read.

**`/video-games/start` does not move.** It's the "App homepage" in Google's OAuth consent screen,
and `APP_NAME` ("Video Game Library") must match the console's App name or brand verification
fails (the comments in `src/lib/appName.ts` and `video-games/start/page.tsx` explain the history).
Moving or renaming either is a Google console change plus re-verification.

**`/sign-in` is `noindex`** and stays out of `sitemap.ts`. Its heading is "Sign in", with one line
saying the account works across the site. No app name, until D10 picks one.

**D10, the consent-screen name.** Until it changes, someone signing in from `/produce` sees Google
say they're signing into "Video Game Library". It's cosmetic, and nothing in this spec blocks on
it. The proper fix, as a separate step whenever convenient:

1. Pick a site-level app name.
2. Make a public page that names it and describes both apps (the homepage is a candidate, though
   Google rejected a page that didn't explain the app once already).
3. Change the console's App name and homepage, and re-verify.

Confirm in Google's docs whether the old branding stays live during review before starting.

**Exit:**

- From `/sign-in?next=/about`, signing in lands on `/about`, for a brand-new user and an existing
  one alike. No onboarding either way.
- From `/video-games/start`, a brand-new user lands on `/onboarding` and then their new library;
  an existing user lands on their library.
- `/library` as a signed-in user with no profile shows Robert's library with **Create a
  profile**; signed out shows the sign-up pitch; with a profile, neither.
- A failed sign-in lands on `/sign-in` with the message and `next` intact.
- `/video-games/account` redirects to `/account`. `/video-games/start` renders as before.
- `next=//evil.com`, `next=/\evil.com` and `next=https://evil.com` all land on `/library`.

## Data model (Phase 4)

One table, one Alembic migration.

### `produce_tastings`

| Column         | Type                                         | Notes                                                |
| -------------- | -------------------------------------------- | ---------------------------------------------------- |
| `user_id`      | `uuid` FK `auth.users` **ON DELETE CASCADE** | The account, not a game-library profile (D11)        |
| `produce_slug` | `text`                                       | CHECK `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 64 chars         |
| `year`         | `smallint`                                   | CHECK `year = extract(year from eaten_on)`           |
| `eaten_on`     | `date`                                       | **Required**, sent by the client. CHECK ≥ 2020-01-01 |
| `created_at`   | `timestamptz`                                |                                                      |

PK `(user_id, produce_slug, year)`.

**The FK to `auth.users` lives in the migration only, not on the SQLAlchemy model**, exactly as
`profiles.id` does it (migration `f985740c0df9`, and the comment on `Profile.id`): `auth.users`
belongs to GoTrue and stays out of our metadata, and `env.py`'s `include_object` filter keeps
autogenerate from proposing to drop it. Account deletion already deletes the auth user and lets
the cascade do the rest, including for an account that never made a profile, so tastings need no
new deletion code. A test proves it.

**Checked: the server cannot default `eaten_on`.** The old draft said "defaults to today in the
caller's region zone", but the API does not know the caller's region, and its own "today" is UTC.
At 8pm on December 31 in New York that is already January 1, which would file the tasting under
the wrong year. So the client sends the date, and the API checks it: it must match the `year` in
the path, and be no later than tomorrow (UTC), which allows every time zone and refuses the far
future.

**The API does not validate slugs against the catalog**: the catalog is a TS module the Python
function can't import, and an unknown slug in your own private log harms nothing. The client
ignores slugs it doesn't know, so a slug that's been retired just stops showing up.

**So the table needs its own ceiling.** Anyone with a Google account can now write rows without
passing the 100-profile cap, and the slug is free text. A user is capped at **1,000 tastings in
total** (the service counts before an insert and answers 409), on top of the 60 writes a minute
every write route already gets. A full catalog every year for a decade fits.

## API (Phase 4)

Under the existing `API_PREFIX` (`/api/library`). The prefix's comment says it names the app,
which these endpoints make slightly untrue. Renaming it touches `apiPrefix.ts`, `config.py`,
`next.config.ts` and the middleware matcher in lockstep, and isn't worth it for one app. Revisit
if a third app arrives (noted in the routing backlog entry).

| Method + path                               | Body / result               | Notes                                   |
| ------------------------------------------- | --------------------------- | --------------------------------------- |
| `GET /me/produce/tastings?year=2026`        | `[{ slug, year, eatenOn }]` | Never cached, no tag (owner-only)       |
| `PUT /me/produce/tastings/{year}/{slug}`    | `{ eatenOn }` → the row     | Idempotent upsert. 409 at the 1,000 cap |
| `DELETE /me/produce/tastings/{year}/{slug}` | 204                         | 204 even if absent                      |

Standard layers: `routers/produce.py` → `services/produce.py` → `repositories/produce.py`.
`PUT` and `DELETE` carry **`WRITE_GUARDS`** in their decorators, like every mutating route:
omitting it fails silently (`core/guards.py`). None of the three requires a profile: they take
`CurrentUser` and nothing else. **Every new endpoint needs a Bruno request** in `api/bruno/`, or
`test_bruno_collection.py` fails; `{year}` and `{slug}` need entries in that test's placeholder
map.

Server Actions in `src/app/produce/actions.ts`, mirroring `video-games/actions.ts`. **No
`revalidateTag`**: nothing about tastings is cached.

## The page (Phase 2 layout)

Top to bottom, mobile first:

1. **Heading**, hand-lettered: "What's in season". Under it, a state sticker ("New York", tap to
   change) and the quiet "season data for the Northeast" line.
2. **Month scrubber**: twelve hand-lettered months, the current one circled by rough.js.
   Scrubbing changes the groups, not the URL.
3. **Category chips**: All, then one per category **that this region actually has**. Client-side
   filter.
4. **The basket** (Phase 4+): "You've tried 7 of the 31 things in season this month."
5. **Four groups**: At its peak, Just arrived, Last chance, Also around. Empty groups hide.
6. **Cards** in a grid: art or seed packet, name, a tiny 12-cell season strip. Tried items get an
   ink stamp.

**Card detail** opens in the site's dialog chrome (`ModalFrame` → `ModalShell`, so the mobile
viewport work comes for free; read `docs/mobile-viewport.md` before touching its position): big
art, `aka`, blurb if any, the full season strip with month labels, and the **I ate this** stamp
button (Phase 4+). Signed out, it reads **Sign in to keep track**.

**Accessibility:** the season strip is never color alone. Peak and storage get a pattern, and the
strip has a text label like "Peak June to August, available May to September". All user-facing copy
follows the no-em-dash rule.

**Uncovered state page:** "We don't have season data for Texas yet." plus links to the covered
states. Honest, not a guess from another region.

**Nav:** a fourth link, "In Season", in `Nav.tsx` (its comment already says the bar has room for
one). Active on anything under `/produce`.

**Homepage tile:** the grid is `grid-cols-3` with exactly three tiles. A fourth needs a layout
decision (2×2, or 4 across on desktop). Build 2×2 on phones and 4 across from `sm` up, and put a
screenshot of each in the PR for Robert to overrule.

**Also in Phase 2:** an OG image for `/produce` (Satori can't read the page's CSS, so draw it
directly, as the library's does), the covered state pages in `sitemap.ts`, and `/privacy`: the
page now reads an approximate location from the request to pick a state (never stored) and sets
one preference cookie when you choose a state yourself. The privacy page is user-facing Markdown,
so the no-em-dash rule applies.

## Phases

Each phase is one branch and one draft PR. Phases 1 to 3 need no backend changes.

| Phase | What                | Branch                     | Depends on | Built by                                              |
| ----- | ------------------- | -------------------------- | ---------- | ----------------------------------------------------- |
| 1a    | Data foundation     | `produce/phase-1-data`     | this spec  | One agent (Opus)                                      |
| 1b    | Two regions curated | same branch                | 1a         | Two agents at once (Opus, web research), one a region |
| 2     | Browse page         | `produce/phase-2-browse`   | 1a, 1b     | One agent (Opus), stacked on the Phase 1 branch       |
| 3     | Site-wide identity  | `identity/site-wide-login` | this spec  | One agent (Opus), in parallel with 1 and 2            |
| 4     | Account tracking    | `produce/phase-4-tracking` | 2, 3       | Not started until Robert has seen 2 on a preview      |

The orchestrating session reviews every diff, runs `npm test`, `npm run lint` and a type check
before a PR opens, and does not merge anything: merging is Robert's.

0. **Review this spec.** Done 2026-11-10.
1. **Data foundation.**
   - **1a:** `src/lib/produce/` as above: types, the catalog (about 100 items, names and
     categories only), states, `season.ts` and its tests, the validator, and the two region files
     as **empty shells that the validator accepts only while a `DRAFT` flag is set**, so 1a is
     green on its own and 1b cannot be forgotten: the flag is deleted in 1b and the validator
     then demands real data. No UI.
   - **1b:** each region file filled by the [curation process](#curation-process-per-region).
     Sources cited in the file.
     **Exit:** `npm test` green; the PR lists ten items per region for Robert to spot-check.
2. **Browse page.** Routes, middleware redirect + picker, ISR month with the client correction,
   `produce.css` both schemes, rough.js chrome, seed-packet fallback, scrubber, chips, groups,
   card detail (no tracking), uncovered-state page, nav link, homepage tile, OG image, sitemap,
   privacy copy.
   **Exit:** deployed on a preview; geo redirect verified there; screenshots at phone and desktop,
   light and dark.
3. **Site-wide identity.** Everything in [Site-wide identity](#site-wide-identity-phase-3),
   including its exit list.
4. **Account tracking.** Migration, API + Bruno, Server Actions, `useTastings`, stamp button,
   stamps on cards, basket, the signed-out "Sign in to keep track" prompt, `AuthButton` on the
   page.
   **Exit:** pytest green **with `DATABASE_URL` set** (two thirds of the suite skips silently
   without it), including the cascade on account deletion for a user with no profile and the
   1,000 cap; signed out, tapping the stamp and signing in lands back on `/produce/{state}` with
   no onboarding; a stamp made on the phone shows on desktop. Verified locally and in production,
   not on a preview (writes are refused there).
5. **Look: season-first view, then art.** First make the opening view per season
   ([Season-first view](#season-first-view-phase-5)): one PR, no data or API change. Then art:
   build the [pluggable source registry](#per-item-art-pluggable-sources-per-item) with the three
   USDA plates and the bottom-of-page credit, then fill items in one by one. Art can land in many
   small PRs; the fallback means any subset ships. Searching other libraries for vegetables comes
   after the registry exists. The look was decided 2026-11-13 (see D8).
6. **More regions.** One region per PR, by the curation process. Parallelizable across agents.
7. **Optional: guest tracking on the device.** Only if signed-out visitors bounce off the sign-in
   prompt. A device backend behind `useTastings` (`localStorage` key `produce:v1:tastings`, read
   through `useSyncExternalStore` with an empty server snapshot, every access in try/catch),
   "Saved on this device. Sign in to keep it for good." copy, and on first signed-in load a
   **prompt** (not auto-import: a shared computer's checks may be someone else's) to import via
   `POST /me/produce/tastings/import` (≤ 500 rows, union, earlier `eaten_on` wins).

### Phase 4 as built

Differences from the sections above, so they read as decisions and not drift:

- **`useTastings(timeZone)`, not `useTastings(year)`.** The year has to come from the browser's
  clock in the region's zone, and `mark` needs the same zone for today's date, so the hook takes
  the zone and derives both.
- **A fourth status, `error`.** A failed read disables **I ate this** instead of showing an empty
  basket: `PUT` replaces the date, so stamping over a row the page could not load would lose the
  original day.
- **The hook subscribes to auth changes** (`onAuthStateChange`) rather than reading the session
  once, so signing out on the page, or in another tab, clears the stamps without a reload.
- **The cap exempts rows that already exist**, so a user at 1,000 can still correct a date.
- **The basket counts the month on show**, not always the real month, and ignores the category
  chip. Scrubbed to June it reads "in season in June".
- **The stamp reuses the month scrubber's rough circle** as its ring. No new rough.js path.

### Phase 5 as built

The season-first view, differences and decisions so they read as decisions and not drift:

- **One rule for a season and a month.** `groupForPeriod(season, months)` takes a list of months;
  `groupFor` is its one-month case, and a test pins them equal for every shipped item in every
  month. Over a season, "arriving" means the item's run **starts inside** the period and
  "leaving" that it **ends inside** it, not that it is in the first or last month. Precedence is
  unchanged: peak, arriving, leaving, around.
- **The leaving signal is a card tag, not a group.** An item that peaks stays in "At its peak"
  even if its run ends in October, which would hide that it is about to vanish. On a season view
  a card whose run ends inside the period says **"Ends in October"**. A single month does not
  show it: its groups already say so. `endsWithin` computes it.
- **The page opens on the whole current season, not the current month.** Selecting a season
  resets to the whole season; selecting a month drills in. "Back to fall" returns to the current
  season. The real season and the real month are marked with a dot as well as colour.
- **Seasons are meteorological and fixed** (`SEASONS` in `season.ts`): spring March to May,
  summer June to August, fall September to November, winter December to February, listed in
  calendar order so winter reads December, January, February.
- **The basket counts the period on show**: "in season this fall", "in season in October".
- **The season icons are rough.js glyphs drawn server-side** with the category glyphs, so rough.js
  stays out of the browser bundle.
- **The category tint stays behind the glyph fallback** and is dropped behind art. See
  [Per-item art](#per-item-art-pluggable-sources-per-item).

### Manual steps, Robert's

Things no agent can do, in the order they come up:

1. **After Phase 3 deploys:** sign in with Google once from `/sign-in?next=/about` in production.
   It cannot be tried on a preview ([Site-wide identity](#site-wide-identity-phase-3)).
2. **Before Phase 1 merges:** spot-check ten items per region.
3. **On Phase 2's preview:** confirm the geo redirect from a phone off wifi.
4. **Phase 4:** the migration reaches production through CD (`docs/deployment.md`); nothing to
   run by hand, but it is the first schema change since `game_notes`, so watch the deploy.
5. **Whenever convenient:** D10, the consent-screen rename and re-verification.

## Testing

- `season.test.ts`: status, arriving and leaving including wrap-around, the three edge cases
  under [Season logic](#season-logic-seasonts), one-group-per-item across every item and month of
  every shipped region, `currentMonth` across a time-zone boundary (07:30 UTC on Feb 1 is still
  January in Los Angeles).
- `data.test.ts`: the validator.
- The middleware's `resolveProduceState` as a pure function: cookie beats geo, unknown codes fall
  through, non-US falls through, an uncovered state still resolves.
- `safeNextPath` (Phase 3): local paths pass; `//evil.com`, `/\evil.com`, `https://evil.com`,
  `@evil.com`, a value with a newline, and empty all fall back to the default.
- pytest (Phase 4): repository upsert and delete, router auth (401 without a JWT), a user with no
  profile can write and read, the year/date mismatch is refused, the 1,000 cap, the cascade on
  account deletion.

## Docs to update when this lands

Each phase updates what it changes, in its own PR.

- `.claude/CLAUDE.md`: Routes table (`/produce`, `/produce/[state]`, `/sign-in`, `/account`,
  `/library`'s no-profile row, and `/video-games/start` re-described as the game library's pitch
  page), Where-things-live rows for `src/lib/produce/`, the produce page, and tracking. The
  convention that auth stays top-level gains `/sign-in` and `/account`, and one line for
  [One login, many apps](#one-login-many-apps): new per-user tables key on the auth user.
- `docs/architecture.md`: a third flow: static data + per-viewer browser read.
- `api/README.md`: `produce_tastings` in the data model.
- `README.md`: one line on what the produce page is.
- `/privacy`: Phase 2's location and cookie lines, Phase 3's account link, Phase 4's "what we
  store" line for tastings.
- The routing-strategy backlog entry: a second app has arrived, and option (a) held.

## Open questions

- **Which Northeast states really share a calendar.** Maine and New Jersey differ by weeks. If the
  spot-check says the Northeast is too wide, split it (Phase 6 machinery already supports it).
- **D10**, the site-level app name.

Settled and recorded so it isn't reopened: calendar year for D6, although citrus runs December to
March and so the basket resets mid-season. Simpler, and it matches "this year".

## Explicitly not in v1

- **Recipes.** v2. Recommended shape when it comes: a few hand-picked links per item in the
  catalog (editorial, no API). TheMealDB is free but thin; Spoonacular and Edamam are paid and
  restrict caching.
- **Where to buy.** Probably v2 at most. The USDA Local Food Portal API (farmers markets, CSAs,
  farm stands by location, key on application) makes "markets near you" feasible; "who has ramps
  this week" is not.
- A public log or follows. D7. When it comes it needs a username, and asks for a game-library
  profile (or a site-level handle) at that point, not before.
- Notes, ratings or photos per tasting.
- Non-US regions.
- Half-month precision. D4.
- Supabase anonymous sign-in, and guest tracking before Phase 7. See [Tracking](#tracking).
