// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import type { Game } from "./games";
import type { WishlistGame } from "./wishlist";

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

// Single cache tag per user covering games AND wishlist. Writes call
// revalidateTag(libraryCacheTag(username)) — the one shared name both sides
// must agree on, so it lives here next to the reads that use it.
export function libraryCacheTag(username: string): string {
  return `library:${username.toLowerCase()}`;
}

// Shared fetch for both endpoints. `path` is the part after the origin
// (e.g. "/api/py/users/robert/games"); `tags` are the cache tags the entry is
// stored under — the caller owns tag naming, this helper only fetches+caches.
async function fetchFromApi<T>(
  origin: string,
  path: string,
  what: string,
  tags: string[]
): Promise<T> {
  const url = `${origin}${path}`;
  let res: Response;
  try {
    // Cached until a write calls revalidateTag with one of these tags.
    // "force-cache" opts in explicitly — Next 15 fetches are uncached by default.
    // This also keeps pages statically renderable: the previous `no-store` was a
    // dynamic API, which broke prerendering of the OG image route at build time.
    // AbortSignal.timeout bounds a *hung* (vs. refused) API: without it the page
    // render would stall indefinitely; with it the failure stays loud and fast.
    res = await fetch(url, {
      cache: "force-cache",
      next: { tags },
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    // Network-level failure (connection refused, DNS, etc.) — the API is
    // configured but unreachable. Fail loudly: a broken API should be
    // obvious in dev, and there is no fallback data source.
    throw new Error(
      `Fetching ${what} from ${url} failed ` +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        `Is the API running? Start it with \`npm run dev:api\`.`
    );
  }
  if (!res.ok) {
    // Same policy for HTTP errors (404 unknown user, 500, ...): loud, actionable.
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

// encodeURIComponent: harmless for the current constant "robert", but Phase 4's
// /u/[username] routes will pass user-shaped input into these URLs.
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
