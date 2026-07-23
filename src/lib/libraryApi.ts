// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import type { Game } from "./games";
import type { WishlistGame } from "./wishlist";

// This module owns the FastAPI origin and the fetch mechanics for the library
// read path. gamesServer.ts / wishlistServer.ts branch to these fetchers when
// LIBRARY_API_ORIGIN is set and keep their CSV code as the fallback until the
// DB read path proves parity.

// Read at call time (not module top level) so the value reflects the current
// process env even if this module is evaluated before env loading finishes.
// process.env is a plain Node global — Next.js loads .env files into it
// automatically (a Next convention; bare Node would need dotenv).
export function getLibraryApiOrigin(): string | undefined {
  const origin = process.env.LIBRARY_API_ORIGIN?.trim();
  return origin ? origin : undefined;
}

// Single cache tag per user covering games AND wishlist. Writes call
// revalidateTag(libraryCacheTag(username)) — the one shared name both sides
// must agree on, so it lives here next to the reads that use it.
export function libraryCacheTag(username: string): string {
  return `library:${username.toLowerCase()}`;
}

// Shared fetch for both endpoints. `path` is the part after the origin,
// e.g. "/api/py/users/robert/games".
async function fetchFromApi<T>(
  origin: string,
  path: string,
  what: string,
  username: string
): Promise<T> {
  const url = `${origin}${path}`;
  let res: Response;
  try {
    // Cached until a write calls revalidateTag with this user's tag.
    // "force-cache" opts in explicitly — Next 15 fetches are uncached by default.
    // This also keeps pages statically renderable: the previous `no-store` was a
    // dynamic API, which broke prerendering of the OG image route at build time.
    // AbortSignal.timeout bounds a *hung* (vs. refused) API: without it the page
    // render would stall indefinitely; with it the failure stays loud and fast.
    res = await fetch(url, {
      cache: "force-cache",
      next: { tags: [libraryCacheTag(username)] },
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    // Network-level failure (connection refused, DNS, etc.) — the API is
    // configured but unreachable. Fail loudly rather than silently falling
    // back to CSV: a configured-but-broken API should be obvious in dev.
    throw new Error(
      `LIBRARY_API_ORIGIN is set but fetching ${what} from ${url} failed ` +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        `Is the API running? Start it with \`npm run dev:api\`, ` +
        `or unset LIBRARY_API_ORIGIN to use the CSV fallback.`
    );
  }
  if (!res.ok) {
    // Same policy for HTTP errors (404 unknown user, 500, ...): loud, actionable.
    throw new Error(
      `LIBRARY_API_ORIGIN is set but ${url} returned ${res.status} ${res.statusText} ` +
        `while fetching ${what}. Check the API logs (\`npm run dev:api\`), ` +
        `or unset LIBRARY_API_ORIGIN to use the CSV fallback.`
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
    username
  );
}

export function fetchWishlistFromApi(origin: string, username: string): Promise<WishlistGame[]> {
  return fetchFromApi<WishlistGame[]>(
    origin,
    `/api/py/users/${encodeURIComponent(username)}/wishlist`,
    "wishlist",
    username
  );
}
