// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import type { Game } from "./games";
import type { WishlistGame } from "./wishlist";
import type { LibraryProfile } from "./profile";

// This module owns the FastAPI origin and the fetch mechanics for the library
// read path — the site's only data source since the CSVs were retired.

// Resolves the FastAPI origin for BOTH the public read path and the
// authenticated /me/* write path (meApi.ts imports this). Since the CSVs were
// retired there's no fallback data source, so an unresolvable origin is a
// misconfiguration that must fail loudly (at build time for the static library
// pages), never render an empty library.
//
// Checked at call time (not module load) so it reflects the live process env.
// Resolution order:
//   - LIBRARY_API_ORIGIN when set — dev points it at the uvicorn process
//     (:8000); prod may set it explicitly.
//   - else VERCEL_PROJECT_PRODUCTION_URL (the public production domain, e.g.
//     rgrassian.com) so a Vercel deploy self-heals with no explicit var —
//     this is why prod cuts over to the API automatically once deployed.
//     DELIBERATELY not VERCEL_URL: that's the per-deployment *.vercel.app
//     hostname, which Deployment Protection gates even when the custom domain
//     is public, so a self-call there would hit the SSO wall (HTML) instead of
//     our JSON.
export function requireLibraryApiOrigin(): string {
  const explicit = process.env.LIBRARY_API_ORIGIN?.trim();
  if (explicit) return explicit;
  const prodDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prodDomain) return `https://${prodDomain}`;
  throw new Error(
    "No FastAPI origin resolved for the library. Set LIBRARY_API_ORIGIN " +
      "(local: http://127.0.0.1:8000, with `npm run dev:api` running), or rely " +
      "on VERCEL_PROJECT_PRODUCTION_URL on a Vercel deploy."
  );
}

// True when this deployment would reach PRODUCTION's API without being
// production itself — i.e. a preview deploy that self-resolved to the
// production domain above.
//
// Reads in that state are fine: the library data is public either way. WRITES
// are not, and the API can't stop them — forbid_in_preview reads the APP_ENV
// of the server *receiving* the request, which for a self-resolved preview is
// production's, so the guard sees "prod" and allows the mutation. Enforcing it
// here, where this deployment's own environment is actually known, is the only
// place the distinction exists.
//
// Setting LIBRARY_API_ORIGIN explicitly opts out: it means someone chose the
// target on purpose (a preview pointed at its own read-only-role API, say),
// and that choice is theirs to make.
export function targetsForeignEnvironmentApi(): boolean {
  if (process.env.LIBRARY_API_ORIGIN?.trim()) return false;
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  // Unset = not a Vercel deploy (local dev, CI), where there's no production
  // domain to accidentally reach.
  return Boolean(vercelEnv) && vercelEnv !== "production";
}

// Single cache tag per user covering games AND wishlist. Writes call
// revalidateTag(libraryCacheTag(username)) — the one shared name both sides
// must agree on, so it lives here next to the reads that use it.
export function libraryCacheTag(username: string): string {
  return `library:${username.toLowerCase()}`;
}

// Shared fetch for both endpoints. `path` is the part after the origin
// (e.g. "/api/py/users/robert/games"); `tags` are the cache tags the entry is
// stored under — the caller owns tag naming, this helper only fetches+caches.
// True while `next build` is prerendering pages, false when serving a request.
// Next sets NEXT_PHASE for the duration of the build; nothing else does.
const IS_PRERENDER = process.env.NEXT_PHASE === "phase-production-build";

// How long to wait on the API before giving up. AbortSignal.timeout bounds a
// *hung* (vs. refused) API: without it a render would stall indefinitely.
//
// The two budgets differ because the deadlines do. Serving a request, someone
// is watching a blank page, so 5s is already generous. Prerendering, nobody is
// waiting and the request may be paying a serverless Python cold start — on
// Vercel the build container calls production's function, which can sit idle
// for days between deploys. A tight bound there turns a slow cold start into a
// failed deployment, which is exactly what it did.
const REQUEST_TIMEOUT_MS = 5_000;
const PRERENDER_TIMEOUT_MS = 30_000;

function fetchWithTimeout(url: string, tags: string[]): Promise<Response> {
  return fetch(url, {
    // Cached until a write calls revalidateTag with one of these tags.
    // "force-cache" opts in explicitly — Next 15 fetches are uncached by
    // default. This also keeps pages statically renderable: an earlier
    // `no-store` was a dynamic API, which broke prerendering of the OG image
    // route at build time.
    cache: "force-cache",
    next: { tags },
    signal: AbortSignal.timeout(IS_PRERENDER ? PRERENDER_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
  });
}

// Network-level failure (connection refused, DNS, timeout) — the API is
// configured but unreachable. Fail loudly: a broken API should be obvious in
// dev, and there is no fallback data source.
function wrapFetchError(err: unknown, what: string, url: string): Error {
  return new Error(
    `Fetching ${what} from ${url} failed ` +
      `(${err instanceof Error ? err.message : String(err)}). ` +
      `Is the API running? Start it with \`npm run dev:api\`.`
  );
}

// Two shapes, one implementation. Without `allowMissing` a 404 is a thrown
// error like any other bad status; with it, a 404 becomes null so the caller
// can distinguish "no such user" from "the API is unwell". Overloads (rather
// than a boolean returning `T | null` for everyone) keep the common callers
// free of a null they can never receive.
async function fetchFromApi<T>(
  origin: string,
  path: string,
  what: string,
  tags: string[]
): Promise<T>;
async function fetchFromApi<T>(
  origin: string,
  path: string,
  what: string,
  tags: string[],
  allowMissing: true
): Promise<T | null>;
async function fetchFromApi<T>(
  origin: string,
  path: string,
  what: string,
  tags: string[],
  allowMissing = false
): Promise<T | null> {
  const url = `${origin}${path}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, tags);
  } catch (err) {
    // One retry, but only while prerendering. A build's first request to the
    // API is very often a serverless Python cold start, and on Vercel that
    // request goes to production's function from the build container — so a
    // timeout here means "still warming up", not "broken". The retry finds it
    // warm. At request time there is a user waiting, so a failure stays a
    // failure.
    if (!IS_PRERENDER) throw wrapFetchError(err, what, url);
    try {
      res = await fetchWithTimeout(url, tags);
    } catch (retryErr) {
      throw wrapFetchError(retryErr, what, url);
    }
  }
  // An expected outcome, not a failure: /video-games/u/{username} for a username nobody
  // owns. The caller turns this into a 404 page.
  if (res.status === 404 && allowMissing) return null;
  if (!res.ok) {
    // Same policy for the rest (500, 502, an unexpected 404, ...): loud, actionable.
    throw new Error(
      `${url} returned ${res.status} ${res.statusText} while fetching ${what}. ` +
        `Check the API logs (\`npm run dev:api\`).`
    );
  }
  // Cast, don't validate: the API contract-mirrors the TS types exactly
  // (camelCase keys, "" for empty values) and that shape is covered by tests
  // on the Python side, so no runtime re-validation here.
  return (await res.json()) as T;
}

// encodeURIComponent throughout: /video-games/u/[username] puts user-shaped input into
// these URLs, so the segment is escaped rather than trusted.
export function fetchGamesFromApi(origin: string, username: string): Promise<Game[]> {
  return fetchFromApi<Game[]>(
    origin,
    `/api/py/users/${encodeURIComponent(username)}/games`,
    "games",
    [libraryCacheTag(username)]
  );
}

export function fetchWishlistFromApi(origin: string, username: string): Promise<WishlistGame[]> {
  return fetchFromApi<WishlistGame[]>(
    origin,
    `/api/py/users/${encodeURIComponent(username)}/wishlist`,
    "wishlist",
    [libraryCacheTag(username)]
  );
}

// null = no such user. Shares the library cache tag with games and wishlist:
// one tag per user covers everything a library page renders, so a single
// revalidateTag after a write refreshes all three.
export function fetchProfileFromApi(
  origin: string,
  username: string
): Promise<LibraryProfile | null> {
  return fetchFromApi<LibraryProfile>(
    origin,
    `/api/py/users/${encodeURIComponent(username)}`,
    "profile",
    [libraryCacheTag(username)],
    true
  );
}
