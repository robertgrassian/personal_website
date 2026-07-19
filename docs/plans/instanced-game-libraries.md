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
  logged in, the same tile takes users straight to *their own* library.

### Non-goals (for v1)

- Deep social features (comments, likes, activity feeds, notifications, block/mute). The
  follow graph above is in scope; everything built *on top of* it is not.
- Importing libraries from Steam/PSN/backloggd/etc.
- Migrating any other part of the site (about, resume, homepage stay static).

## 2. Current State (what we're replacing)

| Concern | Today | Problem for multi-user |
|---|---|---|
| Game data | `games.csv` at repo root, parsed by `src/lib/gamesServer.ts` with `fs.readFileSync` | One file, one owner, edits require a deploy |
| Play state | `sessions.csv`, joined to games **by exact name** in `getGames()` | Name is the only key; collides across users |
| Wishlist | `wishlist.csv` via `wishlistServer.ts` | Same |
| Writes | `add-game` / `session` Claude skills edit CSVs + commit | Only works for the repo owner, from a dev session |
| Cover art | `scripts/fetch-covers.ts` hits IGDB at dev time; URLs stored in CSV | IGDB credentials live outside the site; other users can't trigger lookups |
| Types | `Game`, `WishlistGame`, `RATINGS` in `src/lib/games.ts` / `baseGame.ts` / `wishlist.ts` | These survive mostly intact — they become the API's response shapes |

The FE rendering layer (`GameLibrary`, `ShelfSection`, `FilterBar`, the CRT, stats, the SQL
panel) is already decoupled from *where* data comes from — components receive `Game[]` as
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
  we keep *read* paths for public pages out of the request path via caching (§7).
- **No long-lived state.** No background jobs, no in-process caches that matter, no
  websockets. Nothing in this feature needs them.
- **Connection pooling.** A serverless function per request means naive DB connections
  exhaust Postgres's connection limit. Solution: connect through Supabase's pooler
  (Supavisor, PgBouncer-style) in transaction mode. This is the classic serverless-Postgres
  gotcha — the tech spec should pin the exact connection string mode.
- **Bundle size limit (250 MB unzipped)** — FastAPI + SQLAlchemy + psycopg is far under it.

**Fallback if Vercel Python disappoints** (cold starts too slow, runtime limitations): the
same FastAPI app deploys unchanged to Railway / Fly.io / Render as a normal long-running
service. Because we're writing a standard ASGI app and talking to it over HTTP, this is a
config change (point the rewrite at the external URL), not a rewrite. This portability is a
reason to prefer FastAPI-with-rewrites over deeply Vercel-specific patterns.

### 3.2 Considered alternatives

| Option | Verdict |
|---|---|
| **Next.js Route Handlers / Server Actions (TypeScript BE)** | The lowest-friction option on Vercel and what most Next apps do — but it drops the Python requirement. Kept here for honesty: if the Python function DX on Vercel turns out painful, this is the pragmatic retreat, and the DB/auth/schema design below is unchanged. |
| **Separate Python service from day one (Railway/Fly)** | Clean, no serverless caveats, but a second deploy pipeline, second dashboard, second thing to keep alive. Start on Vercel; §3.1's portability keeps this open. |
| **Keep CSVs, write via GitHub API commits** | Works for self-serve editing (the site commits to the repo) but fundamentally single-user and deploy-per-edit. Rejected. |
| **SQLite/Turso** | Viable, but Postgres knowledge transfers better and Supabase bundles auth. |

## 4. Database

### 4.1 Provider: Supabase Postgres

Reasons over alternatives (Neon via Vercel Marketplace, PlanetScale):

- **Bundled auth** that plays well with a *Python* backend (§5) — this is the deciding factor.
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
  id           uuid PK REFERENCES auth.users(id),
  username     citext UNIQUE NOT NULL,     -- URL handle: /u/{username}
  display_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
)

games (                                   -- one row = one game in one user's library
  id           bigint PK GENERATED ALWAYS AS IDENTITY,
  user_id      uuid NOT NULL REFERENCES profiles(id),
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
  user_id      uuid NOT NULL REFERENCES profiles(id),
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
- **`citext` username** so `/u/Robert` and `/u/robert` are the same person.
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

### 4.3 Derived play state moves to SQL

`derivePlayState()` in `gamesServer.ts` (open session → currently playing; max closed
`end_date` → last played) becomes a query concern — either a lateral join / window function in
the games query or computed in Python after fetching sessions. The `Game` response shape keeps
`currentlyPlaying` / `lastPlayed` / `playingSince` so the FE doesn't care.

## 5. Auth

### 5.1 The Python interop problem (why this drives the DB choice)

The idiomatic Next.js choice, **Auth.js (NextAuth v5)**, has a sharp edge for this stack: its
JWT session cookies are *encrypted* (JWE, A256GCM with HKDF-derived keys), not merely signed.
Verifying them from Python means reimplementing Auth.js's key-derivation — fragile and
version-coupled. Workarounds exist (custom `encode`/`decode`, or a Next route that mints a
second plain JWT for API calls) but they add moving parts exactly where auth bugs are most
expensive.

Providers that issue **standard signed JWTs with a published JWKS endpoint** make the Python
side trivial: FastAPI fetches the JWKS once, verifies `Authorization: Bearer <jwt>` on every
request with `pyjwt`/`python-jose`, and reads the user id from the `sub` claim. This is
exactly a Spring Security *resource server* (`spring-boot-starter-oauth2-resource-server`
pointed at an issuer URI) — the mental model transfers 1:1.

### 5.2 Recommendation: Supabase Auth

- Standard JWTs + JWKS → clean FastAPI verification (§5.1).
- Same vendor as the DB → one dashboard, one set of env vars, `user_id` FKs directly
  reference `auth.users`.
- Social login out of the box; **no passwords stored by us**. **Decided: GitHub + Google
  OAuth only in production** — no email/password, no magic links. (The local dev stack
  additionally enables magic-link auth because Inbucket captures the emails with zero
  external setup; see §7.5.)
- FE integration via `@supabase/ssr` — the session lives in cookies, readable in Next server
  components, and the access token is forwarded to FastAPI on each request.

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
                                          (+ am_i_following when a JWT is present)
GET  /users/{username}/followers        → profile summaries (username, display name, counts)
GET  /users/{username}/following        → profile summaries
GET  /users/search?q=tom                → profile summaries (pg_trgm fuzzy match)

# Social graph (authenticated)
POST   /me/following/{username}         follow
DELETE /me/following/{username}         unfollow

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
  Vercel env vars; the BE caches the OAuth app token. IGDB's rate limit (4 req/s) is fine
  behind a per-user rate limit on the search endpoint.
- **Session semantics match the current `session` skill**: open session = currently playing;
  closing one can attach a rating; multiple open sessions allowed. The skill's confirmation
  UX ("stop other in-progress games?") becomes FE UI.
- **Signup cap (free-tier insurance):** profile creation checks a `MAX_USERS` env var
  (**initial value 100**) against the profile count; over the cap, signup returns an
  "at capacity" response the FE renders as a friendly closed-doors message. Adjustable in
  the Vercel dashboard without a deploy. The cap exists for abuse-bounding, not scale —
  free-tier headroom (500 MB DB, 50k MAU) is far beyond real usage.
- Errors as RFC 7807-ish JSON; FastAPI's automatic OpenAPI docs (`/api/py/docs`) come free
  and are genuinely useful during FE work.

## 7. Frontend Changes

### 7.1 Routing & entry experience

The homepage "Game Library" tile is the front door, and it behaves differently depending on
who clicks it:

1. **Visitor / logged out** → Robert's library, read-only, exactly as today — the demo
   shelf that shows what a full library looks like — with a banner up top:
   *"Sign up / log in to build your own library."*
2. **Logged in** → straight to *your own* library.

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
  the library *directly* — no `/u/[username]/games` nesting; if movie/book libraries
  (TODO backlog) materialize later, `/u/[username]` evolves into a profile hub then.
- `/video_games` — **decided: stays Robert's library** at its stable URL (existing
  links/SEO keep working, no redirect); doubles as the logged-out demo with the sign-up CTA.
- `/library` — the resolver redirect described above.
- Login/account: a sign-in button in `Nav.tsx`; Supabase handles the OAuth dance.
- New-user onboarding: pick a username → auto-follow edges created (§4.2) → empty shelf
  state ("Add your first game") — and one follower already waiting.

### 7.2 Data fetching

`getGames()` / `getWishlist()` change from `fs.readFileSync` to a `fetch` against the API —
same server-component call sites, new implementation. Caching strategy:

- Library pages use Next's fetch cache with **tag-based revalidation**: reads are cached
  (fast, no Python cold start in the visitor path), and every successful write calls
  `revalidateTag(`library:${username}`)`. This is the piece that keeps serverless-Python
  cold starts out of public page loads.
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
   page grows these controls via `isOwner` conditional rendering; no separate manage page,
   so what you see while editing is exactly what visitors see.
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
  Studio (dashboard), and Inbucket — a fake SMTP server that captures all outgoing email.
  Think Testcontainers for the whole Supabase surface. `supabase db reset` + Alembic +
  seed script = a disposable, rebuild-from-scratch database.
- **Alembic owns migrations everywhere.** The Supabase CLI has its own SQL-file migration
  system; we deliberately don't use it — `supabase start` is treated purely as
  infrastructure, and Alembic runs against the local connection string (port 54322) exactly
  as it does against prod. One migration tool, no dual bookkeeping.
- **Local auth without OAuth setup:** the checked-in `supabase/config.toml` enables
  magic-link email auth *locally only* — Inbucket catches the emails, so you can log in as
  any made-up user with zero OAuth app registration. Production stays GitHub+Google-only.
- **JWT config is env-driven in FastAPI:** local GoTrue signs HS256 with a fixed known
  secret; hosted Supabase uses asymmetric keys with a JWKS endpoint. FastAPI takes
  issuer + (shared secret | JWKS URL) from env vars per environment.
- **Vercel preview deploys** can't reach a laptop's Docker, and there is no second cloud
  project. Previews point at prod through a **read-only Postgres role**, and FastAPI
  refuses all mutations when `APP_ENV=preview`. Previews render real data; write paths are
  exercised locally and in prod only.
- **Dev servers:** `uvicorn` and `next dev` run side by side (the §3.1 rewrite targets
  `127.0.0.1:8000` in dev); add a `concurrently`-based npm script so one command starts both.

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
- Alembic baseline migration for the §4.2 schema (minus profiles/auth wiring if desired).
- **Seed script** (Python): parse the three CSVs → insert as Robert's rows. Reuse the
  validation rules from `gamesServer.ts` (rating whitelist, genre `|`-splitting). Idempotent
  (truncate-and-reload) so it can rerun during development.
- Read endpoints; switch `getGames()`/`getWishlist()` to fetch from them.
- **CSV files stay in the repo untouched as fallback** until Phase 3 proves parity.

### Phase 2 — Auth
- Supabase Auth (GitHub + Google), `profiles` table, username onboarding.
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

| # | Item | Decision |
|---|---|---|
| 1 | **Vercel Python cold starts** | Risk accepted pending the Phase 0 spike; measure the read path *and* the stacked Node+Python write path (§7.2). Fallback hosts documented (§3.1). |
| 2 | **Cover images** | **Hotlink IGDB's CDN** (exactly what the CSVs do). Zero egress/storage cost to us; revisit only if IGDB URLs break or ToS enforcement appears. |
| 3 | **Abuse / spam guardrails** | OAuth-only signup, per-user rate limits, row caps (~2k games), IGDB-URLs-only for images, reserved-username list — plus the signup cap (#13). |
| 4 | **Ratings taxonomy** | Global 5-tier S–F scale for all users in v1; per-user scales deferred indefinitely. |
| 5 | **`/video_games` identity** | **Stays Robert's shelf** at its stable URL, doubling as the logged-out demo with the sign-up CTA. No redirect. |
| 6 | **Private libraries** | **None in v1** — all libraries and follower lists are public. |
| 7 | **Local dev** | **Supabase CLI local stack only** (§7.5): Alembic against local Postgres, magic-link auth via Inbucket. No second cloud project; previews hit prod via a read-only role with mutations disabled (`APP_ENV=preview`). |
| 8 | **Two toolchains** | Python gets ruff + pytest and a CI job alongside ESLint/Prettier; husky/lint-staged covers both. |
| 9 | **`/about` Current Hobbies** | Will fetch from the API like everything else — this migration unblocks it. |
| 10 | **Unfollow the founder** | **Allowed** — founder edges behave like any other edge, no special-case code. Tom let you unfriend him. |
| 11 | **Follower/following lists** | Public, consistent with #6. |
| 12 | **Follow-graph abuse** | Follow/unfollow rate-limited like all writes; block/mute deferred (easy to add later since authz is centralized in FastAPI, §5.3). |
| 13 | **Signup cap** | **`MAX_USERS` env var, initial value 100** (§6). Over cap → "at capacity" message; adjustable without a deploy. |
| 14 | **Login methods** | **GitHub + Google OAuth only** in production; no passwords or magic links (local dev uses magic links via Inbucket, §7.5). |
| 15 | **Edit UX** | **Edit-in-place** on your own public `/u/[username]` page via `isOwner` conditional rendering; no separate manage page. |
| 16 | **Wishlist scope** | **All users get a wishlist in v1** — same schema, endpoints, and UI for everyone; Robert's CSV seeds his. |
| 17 | **Route shape** | **`/u/[username]` renders the library directly** — no nesting; becomes a profile hub only if movie/book libraries materialize. |
| 18 | **Write path** | **Server Actions proxy (Next as BFF → FastAPI)** with co-located `revalidateTag()` and `useOptimistic` toggles (§7.2). |
| 19 | **Skills** | **Retire both** `add-game` and `session` when Phase 3 ships (§7.4). |
| 20 | **Supabase free-tier pausing** | Prod project pauses after ~1 week of *zero* activity; normal site traffic should prevent it. If it ever triggers, add an uptime-style scheduled ping (or upgrade) — noted, not built preemptively. |

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
