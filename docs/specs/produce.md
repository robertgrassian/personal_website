# Tech spec: in-season produce tracker

Status: **proposed**, 2026-11-07. Not started. D2, D3 and D5 agreed 2026-11-07; the rest await
review in [Decisions for review](#decisions-for-review).

A page that shows what fruit, vegetables and herbs are in season where you are, this month, and
lets you check off what you've eaten. Whimsical and hand-drawn in look, with no AI art anywhere.

## The v1 promise, in one paragraph

Open `/produce`, land on your state's page (located from your IP, changeable), and see this
month's produce in four groups: **at its peak**, **just arrived**, **last chance**, and **also
around**. Tap anything for its season across the year. Tap **I ate this** to stamp it. A small
basket counts how many of this month's in-season items you've tried this year. Browsing works for
everyone, logged in or not. Tracking needs signing in, with **the same login as the rest of the
site**: one account covers the game library and the produce tracker.

## Decisions for review

Each has a recommendation. The rest of the spec assumes the recommendation, so a different answer
means editing the section it points to.

| #   | Question                          | Recommendation                                                                                                                                                                                                                                                    | Section                                           |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| D1  | Route                             | **`/produce`**, with per-state pages at `/produce/[state]` (`/produce/ny`). `/in-season` reads nicer but is longer and less obvious in a URL bar.                                                                                                                 | [Routes](#routes)                                 |
| D2  | Where seasonality data comes from | **Agreed.** **Our own curated dataset** in typed TS modules, cross-referenced from public sources, with a validator test. There is no open API (below).                                                                                                           | [Data](#data)                                     |
| D3  | Regional granularity              | **Agreed.** **Data keyed by region; a region is a group of states; URLs are by state.** v1 ships two regions: **Northeast** (Robert lives in NYC) and **California**. Other states get an honest "not covered yet" page.                                          | [Regions](#regions)                               |
| D4  | Time granularity                  | **Month**, with four levels: out, available, **peak**, and from **storage**. Half-month (what Seasonal Food Guide uses) doubles curation for little visible gain.                                                                                                 | [Season strings](#season-strings)                 |
| D5  | Tracking identity                 | **Agreed: login-only, on one site-wide login.** No device storage and no Supabase anonymous sign-in in v1. Device tracking for guests stays an optional later phase. Sign-in, onboarding and account settings move out from under `/video-games` first.           | [Tracking](#tracking)                             |
| D6  | What "eaten" means                | **Per calendar year.** One row per (user, item, year), so the page answers "this year" and "ever" from the same data, and the basket resets each January.                                                                                                         | [Data model](#data-model-phase-4)                 |
| D7  | Is the log public                 | **Private in v1.** Owner-only `/me` reads, never cached, no cache tags. A public "Robert has tried 41 things this year" is a cheap later phase.                                                                                                                   | [API](#api-phase-4)                               |
| D8  | Art direction                     | **Ship the page on code-drawn hand-drawn chrome with no per-item art, and run an art spike in parallel** (pixel sprites vs. ink drawings, six items each, drawn by Robert). Each item has an `art` slot that falls back to a lettered "seed packet" until filled. | [Look and feel](#look-and-feel)                   |
| D9  | Item blurbs                       | **Optional field, blank by default, written by Robert over time.** Not AI-drafted, to keep with the spirit of no AI art. Nothing renders when it's blank.                                                                                                         | [Catalog](#catalog)                               |
| D10 | Google consent-screen app name    | **Rename it from "Video Game Library" to a site-level name and re-verify, as its own step that blocks nothing.** Until then, a produce sign-in shows Google's consent screen naming the game library. Pick the new name.                                          | [Site-wide identity](#site-wide-identity-phase-3) |

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

**Login-only, on the site's one login (D5, agreed 2026-11-07).** A signed-out visitor who taps
**I ate this** gets a small "Sign in to keep track" prompt that goes to sign-in and comes back to
the same page. Supabase auth is already one `auth.users` row and one session cookie for the whole
domain, so a produce account and a game-library account are the same account. What isn't
site-wide yet is the screens around it, which [Site-wide identity](#site-wide-identity-phase-3)
fixes first.

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
  failure.

## Site-wide identity (Phase 3)

Supabase auth is site-wide; the screens around it are game-library pages. This phase makes them
the site's, before produce needs them. No new backend.

What's there today, and what changes:

| Today                                                                                                                                           | After                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/video-games/start` is both the sign-in page and the game library's pitch. `SignInPanel`'s Google button hardcodes `next=/library`.            | **A top-level `/sign-in`** renders `SignInPanel` with a `next` taken from its query string. `/video-games/start` **stays** (see below) and renders the same panel with `next=/library`. |
| The magic-link form sets no redirect, so an emailed link always lands on `/library`.                                                            | The magic link carries `next` too. Check the Supabase email template uses the redirect URL it's given before relying on it.                                                             |
| `/auth/callback` and `/auth/confirm` already accept a guarded `next`, but send failures to `/video-games/start`.                                | Failures go to `/sign-in?error=…&next=…`.                                                                                                                                               |
| `/onboarding` says "choose the handle for your game library", bounces signed-out users to `/video-games/start`, and always ends at the library. | Neutral copy (a username is your name across the site, and your game library's address). Accepts `next`, with the same guard, and ends there. Signed out goes to `/sign-in`.            |
| Settings live at `/video-games/account`, linked from the library's menu.                                                                        | **`/account`**, with a permanent redirect from the old URL in `next.config.ts`. `AuthButton`'s menu links it.                                                                           |
| `AuthButton`'s sign-in item links `/video-games/start`.                                                                                         | Links `/sign-in?next=<current path>`.                                                                                                                                                   |

**Where `next` gets lost today, and must not:** sign-in → callback → (no profile) onboarding →
library. Onboarding is the hop that drops it. Every hop in the new chain passes `next` along, and
every one reuses the existing guard (a local path: starts with `/`, not `//`). Extract that guard
into one tested function in `src/lib/` rather than keeping the two copies in the auth routes.

**`/video-games/start` does not move.** It's the "App homepage" in Google's OAuth consent screen,
and `APP_NAME` ("Video Game Library") must match the console's App name or brand verification
fails (the comments in `src/lib/appName.ts` and `video-games/start/page.tsx` explain the history).
Moving or renaming either is a Google console change plus re-verification.

**D10, the consent-screen name.** Until it changes, someone signing in from `/produce` sees Google
say they're signing into "Video Game Library". It's cosmetic, and nothing in this spec blocks on
it. The proper fix, as a separate step whenever convenient:

1. Pick a site-level app name.
2. Make a public page that names it and describes both apps (the homepage is a candidate, though
   Google rejected a page that didn't explain the app once already).
3. Change the console's App name and homepage, and re-verify.

Confirm in Google's docs whether the old branding stays live during review before starting.

**Exit:** signing in from `/produce/ny` as a brand-new user goes Google → onboarding →
back to `/produce/ny`; the same for an existing user skips onboarding; the magic link does the
same; the old account URL redirects; `/video-games/start` is unchanged.

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

**It hangs off `profiles`, so tracking requires onboarding**, which is why Phase 3 makes
onboarding return you to where you started. A signed-in user with no profile who taps **I ate
this** goes to `/onboarding?next=/produce/…`.

## API (Phase 4)

Under the existing `API_PREFIX` (`/api/library`). The prefix's comment says it names the app,
which these endpoints make slightly untrue. Renaming it touches `apiPrefix.ts`, `config.py`,
`next.config.ts` and the middleware matcher in lockstep, and isn't worth it for one app. Revisit
if a third app arrives (noted in the routing backlog entry).

| Method + path                               | Body / result               | Notes                             |
| ------------------------------------------- | --------------------------- | --------------------------------- |
| `GET /me/produce/tastings?year=2026`        | `[{ slug, year, eatenOn }]` | Never cached, no tag (owner-only) |
| `PUT /me/produce/tastings/{year}/{slug}`    | `{ eatenOn? }` → the row    | Idempotent upsert                 |
| `DELETE /me/produce/tastings/{year}/{slug}` | 204                         | 204 even if absent                |

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

**Homepage tile:** the grid is `grid-cols-3` with exactly three tiles. A fourth needs a layout
decision (2×2, or 4 across on desktop). Decide in Phase 2 with a screenshot of each.

**Also in Phase 2:** an OG image for `/produce` (Satori can't read the page's CSS, so draw it
directly, as the library's does), and the covered state pages in `sitemap.ts`.

## Phases

Each phase is one PR, sized for one agent session. Phases 1 to 3 need no backend
changes. Phase 3 can run in parallel with 1 and 2.

0. **Review this spec.** Answer D1, D4 and D6 to D10. **Art spike** starts and runs in parallel with 1 to 3.
1. **Data foundation.** `src/lib/produce/` as above: catalog, regions, states, `season.ts`, the
   validator, the Northeast and California season files with sources. No UI.
   **Exit:** `npm test` green; Robert has spot-checked ten items per region.
2. **Browse page.** Routes, middleware redirect + picker, ISR month, `produce.css` both schemes,
   rough.js chrome, seed-packet fallback, scrubber, chips, groups, card detail (no tracking),
   uncovered-state page, homepage tile, OG image, sitemap.
   **Exit:** deployed on a preview; geo redirect verified there; screenshots at phone and desktop,
   light and dark.
3. **Site-wide identity.** `/sign-in`, `/account` + redirect, `next` through every hop
   including onboarding, neutral onboarding copy, the shared `next` guard, `AuthButton` links.
   See [Site-wide identity](#site-wide-identity-phase-3) for the exit criteria.
4. **Account tracking.** Migration, API + Bruno, Server Actions, `useTastings`, stamp button,
   stamps on cards, basket, the signed-out "Sign in to keep track" prompt.
   **Exit:** pytest green incl. cascade on account deletion; signed out, tapping the stamp and
   signing in lands back on `/produce/{state}`; a stamp made on the phone shows on desktop.
5. **Art.** The spike's winner, filled in item by item. Can land in many small PRs; the fallback
   means any subset ships.
6. **More regions.** One region per PR, by the curation process. Parallelizable across agents.
7. **Optional: guest tracking on the device.** Only if signed-out visitors bounce off the sign-in
   prompt. A device backend behind `useTastings` (`localStorage` key `produce:v1:tastings`, read
   through `useSyncExternalStore` with an empty server snapshot, every access in try/catch),
   "Saved on this device. Sign in to keep it for good." copy, and on first signed-in load a
   **prompt** (not auto-import: a shared computer's checks may be someone else's) to import via
   `POST /me/produce/tastings/import` (≤ 500 rows, union, earlier `eaten_on` wins).

Separately, whenever convenient: **D10**, the consent-screen rename and re-verification.

## Testing

- `season.test.ts`: status, arriving and leaving including wrap-around, one-group-per-item,
  `currentMonth` across a time-zone boundary (23:30 UTC on Jan 31 is still January in Los Angeles).
- `data.test.ts`: the validator.
- A test for the middleware's state resolution as a pure function (cookie beats geo, unknown
  codes fall through, non-US falls through), extracted so it doesn't need a request.
- The `next` guard (Phase 3): local paths pass; `//evil.com`, `https://evil.com`, `@evil.com`
  and empty fall back to the default.
- pytest: repository upsert and delete, router auth
  (401 without a JWT), the cascade on account deletion.

## Docs to update when this lands

- `.claude/CLAUDE.md`: Routes table (`/produce`, `/produce/[state]`, `/sign-in`, `/account`,
  and `/video-games/start` re-described as the game library's pitch page), Where-things-live rows for
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
- Supabase anonymous sign-in, and guest tracking before Phase 7. See [Tracking](#tracking).
