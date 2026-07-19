// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import type { Game } from "./games";
import type { WishlistGame } from "./wishlist";

// This module owns the FastAPI origin and the fetch mechanics for the library
// read path (spec §7.2). gamesServer.ts / wishlistServer.ts branch to these
// fetchers when LIBRARY_API_ORIGIN is set and keep their CSV code as the
// fallback until Phase 3 proves parity (spec §8, Phase 1).

// Read at call time (not module top level) so the value reflects the current
// process env even if this module is evaluated before env loading finishes.
// process.env is a plain Node global — Next.js loads .env files into it
// automatically (a Next convention; bare Node would need dotenv).
export function getLibraryApiOrigin(): string | undefined {
  const origin = process.env.LIBRARY_API_ORIGIN?.trim();
  return origin ? origin : undefined;
}

// Shared fetch for both endpoints. `path` is the part after the origin,
// e.g. "/api/py/users/robert/games".
async function fetchFromApi<T>(origin: string, path: string, what: string): Promise<T> {
  const url = `${origin}${path}`;
  let res: Response;
  try {
    // `cache: "no-store"` — deliberately uncached for now. The spec's tag-based
    // caching (§7.2: `next: { tags: ["library:username"] }` + revalidateTag on
    // writes) only makes sense once writes exist to call revalidateTag (Phase 3).
    // Until then a cached read would just serve stale data after a local seed or
    // DB edit. This is a deliberate interim state; Phase 3 replaces it with tags.
    res = await fetch(url, { cache: "no-store" });
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

export function fetchGamesFromApi(origin: string, username: string): Promise<Game[]> {
  return fetchFromApi<Game[]>(origin, `/api/py/users/${username}/games`, "games");
}

export function fetchWishlistFromApi(origin: string, username: string): Promise<WishlistGame[]> {
  return fetchFromApi<WishlistGame[]>(origin, `/api/py/users/${username}/wishlist`, "wishlist");
}
