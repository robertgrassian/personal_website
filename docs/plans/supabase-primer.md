# Supabase Primer: What It Is, and How (Little of) It We'd Use

**Companion to:** `instanced-game-libraries.md` §4–5. Written to answer: *"Supabase is
described as backend-as-a-service — is that how we'd use it? And if so, why have a Python
backend at all instead of calling Supabase from the frontend?"*

## 1. What Supabase actually is

Supabase is best understood not as one product but as **a managed Postgres database with
optional services bolted around it**, each of which you can use or ignore independently:

| Component | What it is | Backend-world analogy |
|---|---|---|
| **Postgres** | A real, unmodified Postgres instance you get a connection string to | RDS/Cloud SQL |
| **Auth (GoTrue)** | Hosted identity: OAuth social login, magic links, email/password. Issues standard signed JWTs; publishes a JWKS endpoint | Cognito / a lightweight Keycloak |
| **Data API (PostgREST)** | Auto-generates a REST API from your schema: every table becomes `GET/POST/PATCH/DELETE /rest/v1/{table}` with query-param filtering | An auto-generated generic DAO layer exposed over HTTP — imagine Spring Data REST pointed at your whole schema |
| **Row Level Security (RLS)** | Postgres-native (not Supabase-invented) per-row authorization policies, written in SQL, evaluated inside the DB engine | Oracle VPD; `@PostFilter`/row-scoping pushed down into the database itself |
| **Realtime** | WebSocket change feeds off Postgres logical replication | Debezium/CDC → a push channel |
| **Storage** | S3-style object storage with RLS-integrated access rules | S3 + bucket policies |
| **Edge Functions** | Deno (TypeScript) serverless functions for custom logic | Lambda |

The **"backend-as-a-service" pitch** is what you get when you use *all* of it: the browser
talks **directly** to the database through PostgREST using the `supabase-js` client, the
user's JWT rides along on every request, and **RLS policies are your entire authorization
layer**. No application server exists. That's the Firebase-style model, and it's how most
Supabase marketing and tutorials frame it.

The key fact for us: **that mode is optional.** Nothing about Supabase forces it. You can
take the connection string and the auth service and pretend the rest doesn't exist — at
which point Supabase is functionally "RDS + Cognito with a nice dashboard."

## 2. The three architectures on the table

### Mode A — Full BaaS (the marketing architecture)

```
Browser ──supabase-js──▶ PostgREST ──▶ Postgres (RLS enforces everything)
```

- All CRUD via auto-generated API; authorization = RLS policies like
  `CREATE POLICY owner_writes ON games FOR UPDATE USING (user_id = auth.uid());`
- Business logic lives in three places: RLS policies (SQL), Postgres functions/triggers
  (PL/pgSQL), and the client (TypeScript).
- **Still needs *some* server-side compute even here**: the IGDB proxy holds Twitch API
  credentials that can never ship to the browser. In pure-Supabase land that's an Edge
  Function (Deno/TS).

### Mode B — Supabase as infrastructure only (what the main plan proposes)

```
Browser ──▶ Next.js ──▶ FastAPI ──psycopg──▶ Postgres
                │                              ▲
                └──── Supabase Auth (JWTs) ────┘  (FastAPI verifies via JWKS)
```

- PostgREST: **unused** (can be disabled entirely in the dashboard).
- RLS: **not relied upon** — FastAPI is the only DB client, and it enforces ownership checks
  in application code, like every backend you've ever written. (Optionally enabled later as
  defense-in-depth; see §5.)
- Supabase's job description shrinks to: keep Postgres running, run the OAuth dances, sign
  JWTs, provide the connection pooler.

### Mode C — Maximum KISS, for honesty's sake

```
Browser ──▶ Next.js Route Handlers (TypeScript) ──▶ Postgres
```

If the Python requirement were dropped, the *objectively* simplest architecture is no
separate backend at all: Next.js route handlers / Server Actions as the API, one language,
one runtime, one deploy, no rewrite config, no JWT-across-services hop (the auth session is
already right there in the Next server context). This is what most Next.js apps do and it's
worth naming because KISS demands we compare against it — see §4 for why it still loses for
this project.

## 3. So what *is* the point of the Python backend?

Fair challenge — in Mode A, `supabase-js` from the FE genuinely could do most of this app's
CRUD. The case for Mode B:

**1. Real server-side logic exists in this domain, and it wants a home.**
- The **IGDB proxy** (secret credentials, token caching, rate limiting) — needs a server in
  *every* mode; the only question is whether that server is FastAPI, an Edge Function, or a
  Next route handler.
- **Derived play state** (open session → currently playing, newest close → last played):
  in Mode A this logic gets duplicated into client code or pushed into SQL views.
- **Promote wishlist → library** is a multi-statement transaction (insert game, delete
  wishlist row, atomically). PostgREST does one table per call; in Mode A this becomes a
  Postgres function you call via RPC — logic migrating into PL/pgSQL.
- Validation (rating whitelist, genre normalization, row caps for abuse control): Pydantic
  models in one place vs. scattered CHECK constraints + triggers + client checks.

The pattern: **Mode A doesn't eliminate the backend, it dissolves it into SQL policies,
PL/pgSQL, and client code.** For trivial CRUD that's a great trade. The moment there's real
logic, you're writing a backend anyway — just in the database's languages, without a
debugger, unit-test harness, or stack traces you'd enjoy.

**2. Authorization-as-SQL is the part of BaaS that bites people.**
RLS policies are powerful but are effectively security-critical code written in SQL,
evaluated implicitly, tested awkwardly (you impersonate JWTs against a test DB), and easy to
get subtly wrong (a missing policy on one table = data leak; a `USING` vs `WITH CHECK`
mix-up = write hole). In Mode B, authorization is three lines of explicit, unit-testable
FastAPI dependency code: verify JWT → load row → compare `sub` to `user_id`. Boring on
purpose.

**3. Vendor coupling.**
- Mode A couples the *entire app* to Supabase: every FE data call is `supabase-js`,
  authorization only exists as Supabase-hosted policies, custom logic is Deno Edge
  Functions. Migrating off later means rewriting the data layer everywhere.
- Mode B couples only two seams: a Postgres connection string (swappable for Neon/RDS/
  anything) and a JWT issuer URL (swappable for Clerk/Keycloak/anything JWKS-shaped). The
  FastAPI app and every FE call site are vendor-neutral.

**4. The stated requirement.** Python BE was an explicit goal — partly preference, partly
so the backend remains a place where deep existing expertise applies while the *frontend* is
the learning frontier. Mode B keeps the unfamiliar-technology budget spent where the
learning is wanted (React 19, Next caching, auth UX) instead of on a new authorization
paradigm (RLS) that mostly replaces things already known.

## 4. The KISS scorecard

"Simple" splits into two different metrics that point in different directions:

| | Mode A (BaaS) | Mode B (Python BE) | Mode C (Next-only) |
|---|---|---|---|
| Lines of code to CRUD | **Fewest** | Most | Middle |
| Moving parts / hops | Fewest visible, most implicit | Most (Next → FastAPI → DB, 2 runtimes) | **Fewest overall** |
| Where logic lives | SQL policies + PL/pgSQL + client | One Python app | One TS app |
| Testability of authz | Awkward (JWT impersonation vs test DB) | **Plain unit tests** | Plain unit tests |
| Debuggability | Dashboard + DB logs | **Normal backend tooling** | Normal tooling |
| *Unfamiliar*-parts count for this developer | High (RLS, PostgREST semantics, Deno) | **Low** (FastAPI ≈ Spring-shaped) | Medium (all logic in TS/Next) |
| Vendor lock-in | High | **Low** | Low |
| Deploy complexity on Vercel | Low | Highest (Python runtime, rewrites, cold starts) | **Lowest** |
| Python requirement | ✗ | ✓ | ✗ |

Reading: Mode A optimizes lines-of-code simplicity by making architecture implicit; Mode B
optimizes *conceptual* simplicity for a backend engineer by keeping the architecture
explicit and conventional. KISS is about the second kind — a system is simple when its
owner can predict its behavior, and a boring three-tier app is maximally predictable to a
staff backend engineer. The honest runner-up is **Mode C**, which wins every operational
column and loses only the Python requirement; it remains the documented fallback if Vercel's
Python runtime disappoints in the Phase 0 spike (main plan §3.1).

## 5. Exactly which Supabase slices the plan uses

| Supabase feature | Use? | Role |
|---|---|---|
| Postgres + Supavisor pooler | ✅ | The database; pooler makes serverless connections viable |
| Auth (GoTrue) | ✅ | OAuth login, JWT issuing, JWKS for FastAPI verification. `supabase-js` appears in the FE **only** for the sign-in flow and session cookie — never for data access |
| Dashboard / SQL editor | ✅ | Ops convenience (ad-hoc queries, log tailing) |
| PostgREST Data API | ❌ | Disabled in project settings — removes an entire unauthenticated-ish surface area we'd otherwise have to secure with RLS |
| RLS | ⚠️ Later, optional | With PostgREST disabled and FastAPI as sole client, not required. Worth enabling in a hardening phase as defense-in-depth (if the API has an authz bug, the DB backstops it) — classic belt-and-suspenders, adopted once the schema is stable |
| Realtime | ❌ | No live-update requirements |
| Storage | ❌ (revisit) | Candidate home for mirrored cover art if IGDB hotlinking becomes a concern (main plan §9, decision #2) |
| Edge Functions | ❌ | FastAPI is our function runtime |

**Net:** we are *not* using Supabase as a BaaS. We're using it as a Postgres host that
happens to ship a first-class auth service whose JWTs are trivially verifiable from Python.
If Supabase vanished tomorrow, the migration is: restore the Postgres dump anywhere, point
the connection string at it, and stand up any JWKS-publishing identity provider.

## 6. When to revisit this decision

Signals that Mode A (or a hybrid) deserves a second look:
- The FastAPI layer turns out to be pure pass-through CRUD with no real logic (didn't
  happen on paper — IGDB proxy and session semantics already break that — but verify after
  Phase 3).
- Cold starts on Vercel's Python runtime frustrate interactive editing → before jumping
  hosts, consider whether the write path is small enough to be a few Next route handlers
  (Mode C hybrid) while keeping Python for the IGDB/seed tooling.
- A future feature genuinely wants Realtime (e.g. live "now playing" presence) — adopting
  Supabase Realtime for that one feature doesn't require adopting PostgREST for CRUD.
