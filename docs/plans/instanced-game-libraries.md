# Plan: Instanced Game Libraries

**Status:** Decisions locked (2026-07-19) — this document now serves as the tech spec.
All previously open questions are resolved in the decision log (§9); the only remaining
unknowns are the measurements the Phase 0 spike exists to produce.

## 1. Goal

Turn the single, CSV-driven game library into a multi-user ("instanced") feature:

- Visitors can sign up, log in, and build their own game libraries (games, ratings, play
  sessions, wishlist) using the same shelf UI.
- Robert's own library becomes just one instance — editable through the website (add a game,
  rate it, start/stop a session) instead of through CSV edits, commits, and deploys.
- Data moves from `games.csv` / `sessions.csv` / `wishlist.csv` into a real database.
- A **light social graph**: users can visit each other's libraries, follow each other
  (followers/following lists double as quick navigation to other libraries), and search for
  users. Every new user automatically follows — and is followed by — Robert, MySpace-Tom
  style, so nobody starts with an empty network.
- **Entry experience**: the homepage "Game Library" tile shows visitors Robert's library
  read-only (the demo of what a full library looks like) with a sign-up/log-in CTA; once
  logged in, the same tile takes users straight to _their own_ library.

### Non-goals (for v1)

- Deep social features (comments, likes, activity feeds, notifications, block/mute). The
  follow graph above is in scope; everything built _on top of_ it is not.
- Importing libraries from Steam/PSN/backloggd/etc.
- Migrating any other part of the site (about, resume, homepage stay static).

## 2. Current State (what we're replacing)

| Concern    | Today                                                                                   | Problem for multi-user                                                    |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Game data  | `games.csv` at repo root, parsed by `src/lib/gamesServer.ts` with `fs.readFileSync`     | One file, one owner, edits require a deploy                               |
| Play state | `sessions.csv`, joined to games **by exact name** in `getGames()`                       | Name is the only key; collides across users                               |
| Wishlist   | `wishlist.csv` via `wishlistServer.ts`                                                  | Same                                                                      |
| Writes     | `add-game` / `session` Claude skills edit CSVs + commit                                 | Only works for the repo owner, from a dev session                         |
| Cover art  | `scripts/fetch-covers.ts` hits IGDB at dev time; URLs stored in CSV                     | IGDB credentials live outside the site; other users can't trigger lookups |
| Types      | `Game`, `WishlistGame`, `RATINGS` in `src/lib/games.ts` / `baseGame.ts` / `wishlist.ts` | These survive mostly intact — they become the API's response shapes       |

The FE rendering layer (`GameLibrary`, `ShelfSection`, `FilterBar`, the CRT, stats, the SQL
panel) is already decoupled from _where_ data comes from — components receive `Game[]` as
props from a server component. That boundary is the seam we'll cut along: **swap the data
source under `getGames()`; the shelf UI barely changes.**

## 3. Architecture Overview (recommended)

```
Browser
  │
  ├─ Next.js 15 (Vercel) ─ pages, server components, Auth session cookie
  │      │
  │      │  fetch() with user's JWT
  │      ▼
  ├─ FastAPI (Python) ─ deployed as Vercel Serverless Functions, same repo
  │      │
  │      ▼
  └─ Postgres (Supabase) ─ users' libraries, sessions, wishlists
         ▲
         └─ Supabase Auth ─ issues standard JWTs (verified by FastAPI via JWKS)
```

Everything deploys together from this repo on `git push`, exactly like today.

### 3.1 Python backend on Vercel — how and why it works

Vercel's Python runtime can host an ASGI app (FastAPI) as a serverless function. The
officially supported pattern (Vercel's own `nextjs-fastapi` template) is:

- `api/index.py` at the **repo root** (not `src/app/api` — that's Next.js's route-handler
  directory; the root `api/` dir is Vercel's language-agnostic functions dir) exposes
  `app = FastAPI()`.
- A rewrite in `next.config.ts` maps `/api/py/:path*` → the Python function in production,
  and → `http://127.0.0.1:8000` in dev, so locally you run `uvicorn` next to `next dev`.
- FastAPI handles its own internal routing (`/api/py/games`, `/api/py/sessions`, …) — Vercel
  sees one function, FastAPI is the router. Backend analogy: one servlet, Spring `@RequestMapping`s
  inside it.

**Serverless caveats to design around** (these shape several later decisions):

- **Cold starts.** Python functions cold-start in roughly 0.5–2s. Fine for interactive CRUD;
  we keep _read_ paths for public pages out of the request path via caching (§7).
- **No long-lived state.** No background jobs, no in-process caches that matter, no
  websockets. Nothing in this feature needs them.
- **Connection pooling.** A serverless function per request means naive DB connections
  exhaust Postgres's connection limit. Pinned solution: connect through Supabase's
  **transaction-mode pooler** (Supavisor, port 6543), with SQLAlchemy configured for
  `NullPool` (Supavisor owns pooling — don't stack a client-side pool inside a serverless
  function) and **prepared statements disabled** (psycopg `prepare_threshold=None`).
  Transaction-mode pooling breaks session-level prepared statements, which SQLAlchemy/psycopg
  use by default — the classic "works locally, fails on Vercel" trap; local dev against the
  direct connection won't surface it.
- **Bundle size limit (250 MB unzipped)** — FastAPI + SQLAlchemy + psycopg is far under it.

**Fallback if Vercel Python disappoints** (cold starts too slow, runtime limitations): the
same FastAPI app deploys unchanged to Railway / Fly.io / Render as a normal long-running
service. Because we're writing a standard ASGI app and talking to it over HTTP, this is a
config change (point the rewrite at the external URL), not a rewrite. This portability is a
reason to prefer FastAPI-with-rewrites over deeply Vercel-specific patterns.

### 3.2 Considered alternatives

| Option                                                      | Verdict                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js Route Handlers / Server Actions (TypeScript BE)** | The lowest-friction option on Vercel and what most Next apps do — but it drops the Python requirement. Kept here for honesty: if the Python function DX on Vercel turns out painful, this is the pragmatic retreat, and the DB/auth/schema design below is unchanged. |
| **Separate Python service from day one (Railway/Fly)**      | Clean, no serverless caveats, but a second deploy pipeline, second dashboard, second thing to keep alive. Start on Vercel; §3.1's portability keeps this open.                                                                                                        |
| **Keep CSVs, write via GitHub API commits**                 | Works for self-serve editing (the site commits to the repo) but fundamentally single-user and deploy-per-edit. Rejected.                                                                                                                                              |
| **SQLite/Turso**                                            | Viable, but Postgres knowledge transfers better and Supabase bundles auth.                                                                                                                                                                                            |

## 4. Database

### 4.1 Provider: Supabase Postgres

Reasons over alternatives (Neon via Vercel Marketplace, PlanetScale):

- **Bundled auth** that plays well with a _Python_ backend (§5) — this is the deciding factor.
- Plain Postgres: SQLAlchemy/Alembic, `psql`, everything you know from the backend world applies.
- Connection pooler included (needed for serverless, §3.1).
- Free tier comfortably covers a personal site (500 MB DB, 50k monthly active auth users).
- Available through the Vercel Marketplace too, so env vars sync into the Vercel project.

Neon + a separate auth provider (Clerk or Auth.js) is the runner-up; see §5 for why auth
pushes toward Supabase.

### 4.2 Schema

Postgres, managed with **SQLAlchemy 2.0 models + Alembic migrations** (Alembic ≈
Flyway/Liquibase: versioned, ordered migration scripts, checked into the repo, applied from
dev machine/CI — never from the serverless function).

```sql
-- Supabase Auth owns auth.users; we keep an app-level profile row.
profiles (
  id           uuid PK REFERENCES auth.users(id) ON DELETE CASCADE,
  username     citext UNIQUE NOT NULL,     -- URL handle: /u/{username}
                                           -- CHECK: ^[a-z0-9][a-z0-9_-]{2,29}$ (URL-safe,
                                           -- 3-30 chars) + app-level reserved list
  display_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
)

games (                                   -- one row = one game in one user's library
  id           bigint PK GENERATED ALWAYS AS IDENTITY,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         text NOT NULL,
  system       text NOT NULL,
  rating       text CHECK (rating IN ('Perfect','Great','Good','Okay','Bad')),  -- NULL = unrated
  genres       text[] NOT NULL DEFAULT '{}',
  release_date date,
  image_url    text,
  igdb_id      integer,                   -- nullable; set when added via IGDB search
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name, system)          -- same dedupe rule the CSV implies
)

play_sessions (
  id         bigint PK GENERATED ALWAYS AS IDENTITY,
  game_id    bigint NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date   date                          -- NULL = open session = "currently playing"
)

wishlist_items (
  id           bigint PK GENERATED ALWAYS AS IDENTITY,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         text NOT NULL,
  system       text,
  genres       text[] NOT NULL DEFAULT '{}',
  release_date date,
  image_url    text,
  igdb_id      integer,
  starred      boolean NOT NULL DEFAULT false,
  date_added   date NOT NULL DEFAULT CURRENT_DATE,
  notes        text NOT NULL DEFAULT '',
  UNIQUE (user_id, name)
)

follows (                                 -- directed edge: follower → followee
  follower_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id), -- one edge per pair; dup follows impossible
  CHECK (follower_id <> followee_id)      -- no self-follows
)
```

Design decisions worth reviewing:

- **Sessions get a real FK.** Today sessions join to games by exact name — the plan's single
  most important correctness fix. `ON DELETE CASCADE` means deleting a game cleans up its
  history; the delete UI shows a confirm dialog noting how many sessions go with it.
- **Per-user game rows, not a shared canonical catalog.** The normalized alternative — a
  global `games` table keyed by IGDB id plus a `user_games` join table for rating/ownership —
  dedupes metadata and cover art. Rejected for v1: users may add games IGDB doesn't have,
  metadata disagreements get thorny ("my copy is the Switch port"), and the join complicates
  every query. The denormalized shape mirrors the CSV exactly, which makes migration trivial.
  Keeping `igdb_id` on each row leaves the door open to normalize later.
- **Ratings as a DB CHECK mirroring `RATINGS` in `games.ts`.** Two sources of truth (TS
  const + SQL constraint) is a small, acceptable duplication; the API validates against the
  TS-shaped list and the DB backstops it. Alternative: a `ratings` lookup table — overkill for
  five values.
- **`genres text[]`** rather than a join table: we only ever filter by "contains genre",
  which Postgres arrays + a GIN index handle fine, and it matches the `genres: string[]` FE type.
- **`citext` username** so `/u/Robert` and `/u/robert` are the same person, plus a format
  CHECK (URL-safe charset, 3–30 chars). The reserved-username list must include
  **API-colliding tokens** — at minimum `me` and `search`, since `GET /users/search` shares
  a namespace with `GET /users/{username}` — alongside the usual branding/abuse names.
- **Account deletion is designed in, not bolted on.** Everything cascades down from
  `profiles`: `DELETE /me/account` (§6) deletes the profile row (taking games, sessions,
  wishlist, and follows with it via `ON DELETE CASCADE`) and removes the `auth.users` row
  through the Supabase Admin API. OAuth signups will expect this to exist.
- **Alembic must be scoped to the `public` schema.** The `auth` schema is owned and
  migrated by GoTrue (Supabase), not us — Alembic autogenerate would otherwise see those
  tables as undeclared and try to drop them. Configure an `include_object` filter excluding
  `auth`; the `profiles → auth.users` FK is declared in a migration but the referenced
  table is never managed by Alembic.
- **Follows as a bare edge table** (classic many-to-many self-join on `profiles`).
  Follower/following counts are `COUNT(*)` queries — at this scale that's plenty;
  denormalized counter columns are a later optimization if ever needed. Add a
  **pg_trgm GIN index** on `profiles.username` / `display_name` for fuzzy user search.
- **Auto-follow ("MySpace Tom") lives in application code, not a DB trigger**: the
  FastAPI signup flow inserts the profile row plus the two follow edges
  (new-user → founder, founder → new-user) in one transaction, with the founder's user id
  read from an env var. A trigger would work too, but keeping the rule in Python keeps
  business logic visible, testable, and in one place — the same reasoning as §5.3's
  app-side authorization.

### 4.3 Derived play state

`derivePlayState()` in `gamesServer.ts` (open session → currently playing; max closed
`end_date` → last played) is **computed in Python** after fetching a user's games and
sessions (two queries, merged in the service layer) — consistent with the logic-in-app
stance (§5.3); SQL window functions are a profiling-driven optimization only if ever
needed. The `Game` response shape keeps `currentlyPlaying` / `lastPlayed` / `playingSince`
so the FE doesn't care.

## 5. Auth

### 5.1 The Python interop problem (why this drives the DB choice)

The idiomatic Next.js choice, **Auth.js (NextAuth v5)**, has a sharp edge for this stack: its
JWT session cookies are _encrypted_ (JWE, A256GCM with HKDF-derived keys), not merely signed.
Verifying them from Python means reimplementing Auth.js's key-derivation — fragile and
version-coupled. Workarounds exist (custom `encode`/`decode`, or a Next route that mints a
second plain JWT for API calls) but they add moving parts exactly where auth bugs are most
expensive.

Providers that issue **standard signed JWTs with a published JWKS endpoint** make the Python
side trivial: FastAPI fetches the JWKS once, verifies `Authorization: Bearer <jwt>` on every
request with `pyjwt`/`python-jose`, and reads the user id from the `sub` claim. This is
exactly a Spring Security _resource server_ (`spring-boot-starter-oauth2-resource-server`
pointed at an issuer URI) — the mental model transfers 1:1.

### 5.2 Recommendation: Supabase Auth

- Standard JWTs + JWKS → clean FastAPI verification (§5.1).
- Same vendor as the DB → one dashboard, one set of env vars, `user_id` FKs directly
  reference `auth.users`.
- Social login out of the box; **no passwords stored by us**. **Decided: Google OAuth only
  in production** (originally GitHub + Google; GitHub dropped during Phase 2b to keep it
  simple) — no email/password, no magic links. (The local dev stack additionally enables
  magic-link auth because Mailpit captures the emails with zero external setup; see §7.5.)
- FE integration via `@supabase/ssr` — the session lives in cookies, readable in Next server
  components, and the access token is forwarded to FastAPI on each request.
- **Enable Supabase's "JWT signing keys" feature at project setup** — asymmetric keys + a
  JWKS endpoint are _opt-in_; the legacy default signs HS256 with a shared secret and no
  JWKS. The whole clean-verification story (§5.1) assumes the feature is on.
- **Session refresh requires a Next `middleware.ts`** — `@supabase/ssr` relies on middleware
  to refresh the session cookie; without it, access tokens (1h lifetime) go stale and
  server actions start failing with 401s. Small file, load-bearing.
- **The "authenticated but no profile yet" state is real**: OAuth completes (creating an
  `auth.users` row) _before_ the username picker creates the `profiles` row. The `/library`
  resolver and every `/me/*` endpoint must handle it — resolver redirects to onboarding;
  endpoints return a "complete onboarding" error.

Runner-up: **Clerk** (nicest DX, prebuilt UI components, also standard JWTs) — pulls in a
second vendor and its free tier caps at 10k MAU with branding. Fine choice if Supabase Auth
feels clunky in the spike.

### 5.3 Authorization model

- **Reads are public**: anyone (logged in or not) can view any user's library page.
  **Decided: no private-library toggle in v1** — all libraries and follower lists are
  public, like the current site.
- **Writes are owner-only**: every mutating endpoint checks `jwt.sub == row.user_id`.
  Enforced in FastAPI (the API is the only writer). Supabase Row-Level Security is available
  as a defense-in-depth layer but optional since clients never talk to the DB directly.
- **No admin tier needed for v1**; Robert is just a user whose username owns `/video_games`.

## 6. API Design (FastAPI)

All under `/api/py/`. Public reads, JWT-guarded writes. Pydantic models mirror the existing
TS types (`Game`, `WishlistGame`) so the FE types don't churn — Pydantic here plays the role
of Jackson + Bean Validation.

```
# Public reads
GET  /users/{username}/games            → Game[]  (play state pre-derived, §4.3)
GET  /users/{username}/wishlist         → WishlistGame[]
GET  /users/{username}                  → profile + follower/following counts
                                          (public data only — cacheable; see §7.2)
GET  /users/{username}/followers        → profile summaries (username, display name, counts)
GET  /users/{username}/following        → profile summaries
GET  /users/search?q=tom                → profile summaries (pg_trgm fuzzy match)

# Social graph (authenticated)
GET    /me/relationship/{username}      → { am_i_following } — deliberately separate from
                                          the cacheable profile read so per-viewer state
                                          never enters a shared cache entry
POST   /me/following/{username}         follow
DELETE /me/following/{username}         unfollow
DELETE /me/account                      delete account: profile cascade (§4.2) + auth.users
                                        removal via Supabase Admin API

# Authenticated (owner-only writes), acting on "my" library
POST   /me/games                        add a game (typically from an IGDB pick)
PATCH  /me/games/{id}                   edit rating / metadata
DELETE /me/games/{id}
POST   /me/games/{id}/sessions          start session (start_date, no end) or log a past one
PATCH  /me/sessions/{id}                close an open session (set end_date); optional rating in same call
POST   /me/wishlist                     ; PATCH/DELETE /me/wishlist/{id}
POST   /me/wishlist/{id}/promote        wishlist item → library game (the "I bought it" flow)

# IGDB proxy (authenticated, rate-limited)
GET  /igdb/search?q=zelda               → name, systems, release date, cover URL candidates
```

Notes:

- **The IGDB proxy replaces `scripts/fetch-covers.ts` and the add-game skill's Wikipedia
  scraping** for the interactive flow. IGDB credentials (Twitch client id/secret) move to
  Vercel env vars. **Serverless statelessness caveat (§3.1) applies here twice**: the
  Twitch OAuth app token is cached in a one-row Postgres table, not in process memory
  (which dies on every cold start); and per-user rate limits are backed by a Postgres
  counter table, not an in-memory limiter — in-process state is quietly non-functional
  across serverless instances. IGDB's 4 req/s limit is fine behind that.
- **Session semantics match the current `session` skill**: open session = currently playing;
  closing one can attach a rating; multiple open sessions allowed. The skill's confirmation
  UX ("stop other in-progress games?") becomes FE UI.
- **Signup cap (free-tier insurance):** profile creation checks a `MAX_USERS` env var
  (**initial value 100**) against the profile count; over the cap, signup returns an
  "at capacity" response the FE renders as a friendly closed-doors message. Adjustable in
  the Vercel dashboard without a deploy. The cap exists for abuse-bounding, not scale —
  free-tier headroom (500 MB DB, 50k MAU) is far beyond real usage. **Ordering caveat:**
  the check runs at profile creation, but OAuth has already minted an `auth.users` row by
  then; over-cap signups leave an orphaned auth user consuming a MAU. The "at capacity"
  handler deletes the fresh auth user via the Admin API to keep counts honest.
- Errors as RFC 7807-ish JSON. FastAPI's automatic OpenAPI docs are useful during FE work
  but **disabled in production** (`docs_url=None` unless `APP_ENV=dev`).

## 7. Frontend Changes

### 7.1 Routing & entry experience

The homepage "Game Library" tile is the front door, and it behaves differently depending on
who clicks it:

1. **Visitor / logged out** → Robert's library, read-only, exactly as today — the demo
   shelf that shows what a full library looks like — with a banner up top:
   _"Sign up / log in to build your own library."_
2. **Logged in** → straight to _your own_ library.

**How the auto-routing works (the "store a cookie or something" question):** no new cookie
is needed — Supabase Auth already keeps the session in an httpOnly cookie with long-lived
refresh tokens, so a returning user stays "remembered" for months. The clean Next.js
pattern is a tiny **resolver route**:

- The homepage tile (and the nav link) point at `/library`.
- `/library` is a page that renders nothing: its server component reads the session cookie
  and immediately issues a `redirect()` — logged in → `/u/{your-username}`, logged out →
  `/video_games`.
- Why the extra hop instead of checking the cookie on the homepage itself: reading cookies
  in a Next.js page opts that page into **dynamic rendering** (rebuilt per-request instead
  of served static from the CDN). Quarantining the cookie read into a redirect-only route
  keeps `/` and `/video_games` fully static and fast, and only the invisible `/library` hop
  is dynamic. (The alternative — conditionally rendering the tile's href server-side — works
  but makes the whole homepage dynamic for one link.)

Routes:

- `/u/[username]` — any user's library (public, dynamic route). Shelf UI + profile header
  (display name, follower/following counts, follow button). **Decided:** this URL renders
  the library _directly_ — no `/u/[username]/games` nesting; if movie/book libraries
  (TODO backlog) materialize later, `/u/[username]` evolves into a profile hub then.
- `/video_games` — **decided: stays Robert's library** at its stable URL (existing
  links/SEO keep working, no redirect); doubles as the logged-out demo with the sign-up CTA.
- `/library` — the resolver redirect described above.
- Login/account: **the sign-in surface lives inside the game library, not the global
  nav** (decided 2026-07-22 — see below); Supabase handles the OAuth dance.
- New-user onboarding: pick a username → auto-follow edges created (§4.2) → empty shelf
  state ("Add your first game") — and one follower already waiting.

**Auth is the game library's, not the whole site's (decided 2026-07-22).** The portfolio
(`/`, `/about`, `/resume`) is static content with no accounts; the game library is the only
app with sign-in. So the auth _surfaces_ — the login page, the sign-in/out control, and the
post-login/onboarding destination — all live under the game library, not in the site-wide
nav or the portfolio home. The auth _infrastructure_ stays domain-wide: one Supabase session
cookie on `rgrassian.com` (deliberately **not** path-scoped), the middleware refresh, and the
`/auth/*` handlers are unchanged — keeping future cross-app SSO open (a shared login if the
movie/book libraries in the backlog ever land). Post-login/onboarding redirects **into the
library** (`/library` → your `/u/{username}`), never the portfolio home. _Deferred to Phase
4_ (bundled with the entry-experience rework below); Phase 2 shipped auth top-level as an
interim, and nothing is blocked by waiting.

**Google OAuth brand verification is deferred to Phase 4.** To show the app name on the
Google consent screen instead of the raw `*.supabase.co` redirect host, Google requires an
"App homepage" URL that names the app, states its purpose in text, and links the privacy
policy. The logged-out `/video_games` **sign-up CTA banner** above is exactly such a page —
so we point Google's App homepage at `https://rgrassian.com/video_games` and let the banner
satisfy verification as a byproduct of building it (no throwaway content, no change to the
portfolio home — a bare login page or the photo-only home both fail Google's "explain the
purpose" check, learned 2026-07-22). **App name: "Robert's Game Library."** Until this ships,
the consent screen shows the `supabase.co` host — a purely cosmetic label; auth is fully
functional. (Erasing every `supabase.co` reference entirely would need Supabase's paid custom
auth domain — out of scope.) The `/privacy` page already exists and supplies the required
privacy URL now.

**Open items — Phase 4 (deferred 2026-07-22).** Concrete, trackable tasks for the two
decisions above:

- [ ] **Build the logged-out sign-up CTA banner** on `/video_games` — names the app
      ("Robert's Game Library"), states its purpose, links `/privacy`. This page becomes
      Google's App homepage, so the app-name string shown here must match the consent screen
      exactly.
- [ ] **Update Google Cloud OAuth config and re-run brand verification** (manual dashboard
      step, _after_ the banner deploys): App name → "Robert's Game Library"; App homepage →
      `https://rgrassian.com/video_games`; Privacy policy → `https://rgrassian.com/privacy`;
      add `rgrassian.com` as an authorized domain; resubmit. Done = the consent screen shows
      the app name, not the `supabase.co` host.
- [ ] **Remove Sign in / Sign out from the global `Nav`** — surface sign-in inside the game
      library, and give logged-in users a sign-out control there too (it no longer lives in
      the nav).
- [ ] **Move the login surface under the game library** (`/video_games/login`, or a
      library-local sign-in affordance); update every link/redirect that points at `/login`,
      including the `/auth/confirm` and `/auth/callback` error redirects (`/login?error=…`).
- [ ] **Redirect post-login _and_ post-onboarding into the library** (`/library` resolver →
      `/u/{username}`), never the portfolio home `/`. Replaces the interim `redirect("/")`
      and fixes the current "lands on rgrassian.com after onboarding" behavior.
- [ ] **Leave auth infrastructure untouched**: session cookie stays site-wide (not
      path-scoped), middleware and `/auth/*` handlers unchanged.
- [ ] _Contingency_: if Google also demands a **Terms of Service** URL, add `/terms` (same
      pattern as `/privacy`).

### 7.2 Data fetching

`getGames()` / `getWishlist()` change from `fs.readFileSync` to a `fetch` against the API —
same server-component call sites, new implementation. Caching strategy:

- Library pages use Next's fetch cache with **tag-based revalidation**: reads opt in to
  caching (in Next 15, `fetch()` is _uncached by default_ — each read passes
  `next: { tags: ['library:username'] }` explicitly), and every successful write calls
  `revalidateTag(`library:${username}`)`. This keeps serverless-Python cold starts out of
  cache-hit page loads (the first visitor after a write still eats one — acceptable).
- **The personalization rule (load-bearing):** cached payloads and server-rendered pages
  contain **public data only**. All per-viewer state — `isOwner` edit affordances, the
  follow button, `am_i_following`, the logged-out sign-up CTA — is resolved **client-side
  after hydration** via small authenticated, uncached calls (e.g. `/me/relationship/…`,
  §6). Two reasons this can't be server-rendered: a URL-keyed cache entry can't hold both
  the owner variant and the anonymous variant (worse, it would leak one viewer's state to
  everyone), and reading the auth cookie in the page would opt the whole route into dynamic
  rendering — defeating the exact static-page strategy §7.1 built the `/library` resolver
  to protect. Costs a brief flicker before edit controls appear on your own page; fine.
- **Decided: mutations go through Next Server Actions that proxy to FastAPI** — the action
  reads the httpOnly session cookie, forwards the request with the JWT, then calls
  `revalidateTag()` so cached pages refresh. Next acts as a thin BFF (backend-for-frontend)
  in front of the domain service; `useOptimistic` gives instant rating/follow toggles that
  roll back on failure. The forcing function is that `revalidateTag()` can only execute on
  the Next server — a direct browser→FastAPI call would need a separate Next revalidation
  endpoint anyway, splitting cache logic in two. Accepted cost: an extra hop, worst-case a
  stacked Node+Python cold start on the first write after idle (measured in Phase 0).
  Rejected shortcut: server actions querying Postgres directly — that would split the write
  path across two languages and break the single-writer authorization model (§5.3).

### 7.3 New UI surface (the real FE work)

1. **Add game flow**: search box → IGDB results (cover thumbnails) → confirm system/genres →
   POST. Replaces the `add-game` skill for day-to-day use.
2. **Edit affordances on `GameCase`/`GameCaseBack`** (owner only): set/change rating,
   start/stop session, delete. **Decided: edit-in-place** — your own public `/u/[username]`
   page grows these controls via `isOwner` conditional rendering — resolved client-side
   after hydration per the personalization rule (§7.2); no separate manage page, so what
   you see while editing is exactly what visitors see.
3. **Wishlist management** incl. the promote-to-library flow.
4. **Auth UI**: sign-in, username picker, sign-out in nav.
5. Empty states for brand-new libraries.
6. **Sign-up CTA banner** on Robert's library for logged-out visitors (§7.1).
7. **Profile header on library pages**: display name + follower/following counts; counts
   open a list where each row links straight to that user's library — the "quick click-over"
   navigation between libraries.
8. **Follow/unfollow button** on other users' libraries (hidden on your own).
9. **User search** — a "find people" input returning profile summaries that link to their
   libraries. **Decided:** lives inside the follower/following list modal plus a compact
   input in the nav next to sign-in — no dedicated page for v1.

Existing components (`GameLibrary`, `FilterBar`, shelves, CRT, stats, SQL panel) keep
working on `Game[]` props unchanged. The alasql-powered `SqlQueryPanel` still queries the
in-memory array client-side — no change.

### 7.4 What happens to the skills

**Decided: retire both.** Once Phase 3 ships, the web UI is the only write path — no
service-token story for skills to maintain. `add-game`'s Wikipedia-scraping flow and
`session`'s CSV editing are deleted alongside the CSVs. (If terminal-driven logging is ever
missed, a future skill can wrap the API — nothing forecloses that.)

### 7.5 Environments & local development

**Decided: Supabase CLI local stack, no second cloud project.**

- **Local:** `supabase start` (Docker Compose under the hood) runs Postgres, GoTrue (auth),
  Studio (dashboard), and Mailpit — a fake SMTP server that captures all outgoing email
  (older CLI versions shipped Inbucket; current ones ship Mailpit). Think Testcontainers
  for the whole Supabase surface. `supabase db reset` + Alembic +
  seed script = a disposable, rebuild-from-scratch database.
- **Alembic owns migrations everywhere.** The Supabase CLI has its own SQL-file migration
  system; we deliberately don't use it — `supabase start` is treated purely as
  infrastructure, and Alembic runs against the local connection string (port 54322) exactly
  as it does against prod. One migration tool, no dual bookkeeping.
- **Local auth without OAuth setup:** the checked-in `supabase/config.toml` enables
  magic-link email auth _locally only_ — Mailpit catches the emails, so you can log in as
  any made-up user with zero OAuth app registration. Production stays Google-only.
- **JWT config is env-driven in FastAPI:** FastAPI takes issuer + (JWKS URL | shared
  secret) from env vars per environment. **Updated during Phase 2a implementation
  (2026-07-20):** the current Supabase CLI local stack signs access tokens with
  **asymmetric keys (ES256) and publishes a JWKS endpoint** — the same model as hosted
  Supabase, not the HS256 shared secret this section originally assumed. So **both local
  and prod use the JWKS path** (`SUPABASE_JWKS_URL` + `SUPABASE_AUTH_ISSUER`); this is
  strictly better because it exercises the exact production verification path locally,
  mitigating the no-staging risk called out below. The HS256 shared-secret path is
  retained in `app/core/auth.py` only as a legacy fallback. (PyJWT needs the
  `cryptography` extra for ES256 — pinned as `pyjwt[crypto]`.)
- **Vercel preview deploys** can't reach a laptop's Docker, and there is no second cloud
  project. Previews point at prod through a **read-only Postgres role**, and FastAPI
  refuses all mutations when `APP_ENV=preview`. That role must be locked down properly —
  `GRANT SELECT` only, `ALTER DEFAULT PRIVILEGES` revoked so future tables aren't
  writable, no `auth` schema access — because preview URLs are guessable and this is
  otherwise a latent write path into prod. Two accepted caveats, flagged deliberately:
  previews still authenticate against _prod_ Supabase Auth (real accounts), and since
  writes run only locally and in prod, **there is no staging — the first time the full
  write path runs against hosted Supabase (pooler, JWKS, Admin API) is production.**
  Mitigation: the Phase 0 spike exercises exactly those integration points ahead of time.
- **Dev servers:** `uvicorn` and `next dev` run side by side (the §3.1 rewrite targets
  `127.0.0.1:8000` in dev); add a `concurrently`-based npm script so one command starts both.

### 7.6 Secrets & configuration

Where every credential lives — **nothing sensitive is ever committed to the repo**:

| Credential                                               | Lives in                                        | Notes                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Twitch/IGDB client id + secret                           | Vercel env vars (server-side)                   | Read only by FastAPI. Today they're passed inline to `fetch-covers.ts` and stored nowhere; that script retires in Phase 3       |
| Derived Twitch app access token                          | One-row Postgres table (§6)                     | Runtime data, never in the repo                                                                                                 |
| Supabase DB connection strings (contain the DB password) | Vercel env vars; locally in `.env` (gitignored) | Pooler URL for the app, direct URL for Alembic                                                                                  |
| Supabase service-role key (Admin API)                    | Vercel env var, FastAPI only                    | **The most dangerous secret** — bypasses all authorization. Never `NEXT_PUBLIC_`, never sent to the browser                     |
| Supabase anon/publishable key + project URL              | `NEXT_PUBLIC_` env vars                         | Public **by design** (the browser needs them for the OAuth dance); safe to expose, not to be confused with the service-role key |
| Google OAuth client secret                               | Supabase dashboard                              | Never touch the repo at all                                                                                                     |
| JWKS URL / issuer                                        | Plain config                                    | Public by definition — verification needs no secret                                                                             |
| Preview read-only role password                          | Vercel preview-scoped env var                   | The locked-down role from §7.5                                                                                                  |
| `MAX_USERS`, `APP_ENV`                                   | Env vars                                        | Configuration, not secrets                                                                                                      |

Guardrails against accidental check-in:

- `.gitignore` already covers `.env*` (Next.js default) — keep it that way; commit only a
  `.env.example` listing variable _names_ with placeholder values.
- The checked-in `supabase/config.toml` references secrets only via `env(VAR_NAME)`
  substitution, never literal values. (The local stack's fixed HS256 JWT secret is a
  published public default — not sensitive.)
- **The `NEXT_PUBLIC_` prefix is the sharp edge to respect**: Next.js inlines any
  `NEXT_PUBLIC_*` var into the client JavaScript bundle at build time. The prefix is an
  explicit opt-in to "this ships to every browser" — no server-side secret ever gets it.
- GitHub push protection / secret scanning stays enabled on the repo as a backstop.

## 8. Migration & Rollout Phases

Each phase ships independently and leaves the site working.

### Phase 0 — Spike & decisions (de-risk before building)

- Deploy hello-world FastAPI in this repo on Vercel (the `nextjs-fastapi` rewrite pattern);
  measure cold start — including the worst-case stacked Node+Python cold start on the
  server-action write path (§7.2).
- Provision Supabase; connect from the deployed function via the pooler.
- Verify Supabase JWT verification from FastAPI (JWKS).
- Outcome: confirm the recommended stack or trigger a documented fallback (§3.1/§5.2).

### Phase 1 — DB + read path (still single-user, no auth)

- Alembic baseline migration for the §4.2 schema, scoped to `public` (§4.2). Note:
  `games.user_id` is `NOT NULL`, so Phase 1 can't skip profiles entirely — seed a
  placeholder Robert profile row now; Phase 2 re-parents it to the real auth user.
- **Seed script** (Python): parse the three CSVs → insert as Robert's rows. Reuse the
  validation rules from `gamesServer.ts` (rating whitelist, genre `|`-splitting). Idempotent
  (truncate-and-reload) so it can rerun during development. **Name→id bridge:**
  `sessions.csv` references games by name only, while `play_sessions` needs a `game_id` —
  the script resolves by name and _fails loudly on ambiguity_ (two library entries sharing
  a name across systems) rather than guessing; ambiguous rows get resolved by hand in the CSV.
- **Keep-alive**: a daily Vercel Cron hitting a `/api/py/health` endpoint (`SELECT 1`).
  Needed because §7.2's caching keeps normal traffic _off_ the DB, which makes Supabase's
  7-day inactivity pause (§9 #20) more likely, not less — passive traffic can't be relied on.
- Read endpoints; switch `getGames()`/`getWishlist()` to fetch from them.
- **CSV files stay in the repo untouched as fallback** until Phase 3 proves parity.

### Phase 2 — Auth

- Supabase Auth (Google OAuth; GitHub dropped in 2b), `profiles` table, username onboarding.
- Robert signs up; seed data gets re-parented to that real user id.
- FastAPI JWT middleware; still no write endpoints exposed in UI.

### Phase 3 — Owner editing (the "no more CSV commits" milestone)

- Write endpoints + IGDB proxy + rate limiting.
- Add-game flow, rating editor, session start/stop UI, wishlist management.
- Cache revalidation wiring.
- After a parity week: delete CSVs, `gamesServer.ts`/`sessionsServer.ts`/`wishlistServer.ts`
  fs code, `scripts/fetch-covers.ts`, and the `add-game`/`session` skills (§7.4).

### Phase 4 — Multi-user

- `/u/[username]` public routes, signup open, empty states, per-user rate limits.
- The `/library` resolver route + sign-up CTA banner on `/video_games` (§7.1).
- Entry experience, auth-surface scoping, and Google brand verification — see the
  **Open items checklist in §7.1** (banner, remove nav sign-in/out, redirect post-login into
  the library, update Google Cloud + re-verify).
- Light abuse guardrails (§9).

### Phase 5 — Social graph

- `follows` table + follow/unfollow endpoints; auto-follow wiring in the signup flow.
- Backfill: create follow edges between Robert and any users who signed up during Phase 4.
- Profile headers with follower/following counts and lists; follow button; user search
  (pg_trgm index + `/users/search` endpoint + UI).

### Phase 6 — Hardening / polish (as needed)

- Neon-style preview-DB story: Supabase branching or a shared dev project for Vercel
  preview deployments (spec decision).
- Backups (Supabase does daily on free tier; document restore).
- Analytics on signups; sitemap entries for public libraries.

## 9. Decision Log (all resolved 2026-07-19)

| #   | Item                           | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Vercel Python cold starts**  | **Spike run 2026-07-19: no red flags.** Function builds and serves on Vercel (after an entrypoint sys.path fix — bundle root is the repo root, not api/). Preview /api/py/health: ~80ms function response on first visit (~700ms total incl. SSO redirect chain); true idle-cold not yet isolated but even a several-fold multiple stays within budget. Fallback hosts (§3.1) remain documented, not needed on current evidence. Re-measure the stacked write path when server actions land (Phase 3). |
| 2   | **Cover images**               | **Hotlink IGDB's CDN** (exactly what the CSVs do). Zero egress/storage cost to us; revisit only if IGDB URLs break or ToS enforcement appears.                                                                                                                                                                                                                                                                                                                                                         |
| 3   | **Abuse / spam guardrails**    | OAuth-only signup, per-user rate limits, row caps (~2k games), IGDB-URLs-only for images, reserved-username list — plus the signup cap (#13).                                                                                                                                                                                                                                                                                                                                                          |
| 4   | **Ratings taxonomy**           | Global 5-tier S–F scale for all users in v1; per-user scales deferred indefinitely.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5   | **`/video_games` identity**    | **Stays Robert's shelf** at its stable URL, doubling as the logged-out demo with the sign-up CTA. No redirect.                                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | **Private libraries**          | **None in v1** — all libraries and follower lists are public.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7   | **Local dev**                  | **Supabase CLI local stack only** (§7.5): Alembic against local Postgres, magic-link auth via Mailpit. No second cloud project; previews hit prod via a locked-down read-only role with mutations disabled (`APP_ENV=preview`); no-staging caveat accepted (§7.5).                                                                                                                                                                                                                                     |
| 8   | **Two toolchains**             | Python gets ruff + pytest and a CI job alongside ESLint/Prettier; husky/lint-staged covers both.                                                                                                                                                                                                                                                                                                                                                                                                       |
| 9   | **`/about` Current Hobbies**   | Will fetch from the API like everything else — this migration unblocks it.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 10  | **Unfollow the founder**       | **Allowed** — founder edges behave like any other edge, no special-case code. Tom let you unfriend him.                                                                                                                                                                                                                                                                                                                                                                                                |
| 11  | **Follower/following lists**   | Public, consistent with #6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 12  | **Follow-graph abuse**         | Follow/unfollow rate-limited like all writes; block/mute deferred (easy to add later since authz is centralized in FastAPI, §5.3).                                                                                                                                                                                                                                                                                                                                                                     |
| 13  | **Signup cap**                 | **`MAX_USERS` env var, initial value 100** (§6). Over cap → "at capacity" message; adjustable without a deploy.                                                                                                                                                                                                                                                                                                                                                                                        |
| 14  | **Login methods**              | **Google OAuth only** in production (updated 2026-07: GitHub dropped for simplicity); no passwords or magic links (local dev uses magic links via Mailpit, §7.5).                                                                                                                                                                                                                                                                                                                                      |
| 15  | **Edit UX**                    | **Edit-in-place** on your own public `/u/[username]` page via `isOwner` conditional rendering; no separate manage page.                                                                                                                                                                                                                                                                                                                                                                                |
| 16  | **Wishlist scope**             | **All users get a wishlist in v1** — same schema, endpoints, and UI for everyone; Robert's CSV seeds his.                                                                                                                                                                                                                                                                                                                                                                                              |
| 17  | **Route shape**                | **`/u/[username]` renders the library directly** — no nesting; becomes a profile hub only if movie/book libraries materialize.                                                                                                                                                                                                                                                                                                                                                                         |
| 18  | **Write path**                 | **Server Actions proxy (Next as BFF → FastAPI)** with co-located `revalidateTag()` and `useOptimistic` toggles (§7.2).                                                                                                                                                                                                                                                                                                                                                                                 |
| 19  | **Skills**                     | **Retire both** `add-game` and `session` when Phase 3 ships (§7.4).                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 20  | **Supabase free-tier pausing** | Prod project pauses after ~1 week of DB inactivity — and §7.2's caching keeps normal traffic _off_ the DB, making this more likely, not less. **Built, not deferred:** daily Vercel Cron → `/api/py/health` keep-alive, shipped in Phase 1.                                                                                                                                                                                                                                                            |
| 21  | **Per-viewer UI vs cache**     | Cached payloads/pages contain **public data only**; all per-viewer state (`isOwner` controls, follow button, `am_i_following`, CTA banner) resolves client-side after hydration via uncached authenticated calls (§7.2).                                                                                                                                                                                                                                                                               |
| 22  | **Account deletion**           | `DELETE /me/account`: `ON DELETE CASCADE` down from `profiles` (games, sessions, wishlist, follows) + `auth.users` removal via the Supabase Admin API (§4.2, §6).                                                                                                                                                                                                                                                                                                                                      |
| 23  | **Play-state derivation**      | Computed in Python from two queries (§4.3), consistent with logic-in-app; SQL window functions only if profiling ever demands.                                                                                                                                                                                                                                                                                                                                                                         |
| 24  | **OpenAPI docs in prod**       | Disabled outside dev (`docs_url=None` unless `APP_ENV=dev`).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 25  | **Secrets**                    | All credentials live in Vercel env vars / the Supabase dashboard / gitignored local `.env` files — never the repo (§7.6). Runtime tokens (Twitch app token) live in Postgres.                                                                                                                                                                                                                                                                                                                          |

## 10. What You'll Learn (per phase, mapped to backend knowledge)

- **Phase 0–1:** Serverless functions vs servlet containers; connection pooling without a
  pool you own; SQLAlchemy 2.0 (≈ JPA/Hibernate but more explicit) and Alembic (≈ Flyway);
  Pydantic (≈ Jackson + Bean Validation).
- **Phase 2:** OAuth/OIDC flows from the consuming side; JWT vs session cookies; JWKS-based
  resource-server verification (≈ Spring Security resource server).
- **Phase 3:** Next.js caching layers (fetch cache, tags, ISR) — the part of Next with no
  clean backend analogy and the most "framework magic" to demystify; optimistic UI updates;
  forms and mutations in React 19 (Server Actions, `useActionState`).
- **Phase 4:** Dynamic routes + `generateStaticParams`; multi-tenant authorization
  patterns; static vs dynamic rendering and why the `/library` resolver-redirect pattern
  exists (§7.1) — Next's server-side `redirect()` and cookie access.
- **Phase 5:** Modeling a social graph as a self-referential many-to-many (familiar SQL,
  new UI patterns); optimistic follow/unfollow toggles in React.
