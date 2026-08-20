// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import { API_PREFIX, LEGACY_API_PREFIX } from "./apiPrefix";
import type { Game } from "./games";
import type { WishlistGame } from "./wishlist";
import type { LibraryProfile } from "./profile";
import type { UserSummary } from "./follows";

// This module owns the FastAPI origin and the fetch mechanics for the library
// read path.

// Resolves the FastAPI origin for BOTH the public read path and the
// authenticated /me/* write path (meApi.ts imports this). There is no fallback
// data source, so an unresolvable origin is a misconfiguration that must fail
// loudly (at build time for the static library pages), never render an empty
// library.
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

// Cache tags, lowercased because usernames are citext in Postgres: /u/RGrassian
// and /u/rgrassian are one library and must share one tag, or a write under one
// spelling leaves the other serving stale pages.
//
// Two levels, and every read carries both. The umbrella tag is the "purge
// everything for this user" escape hatch; the resource tags are what writes
// normally use, so a rating edit refetches games alone rather than all five
// reads (~12 Postgres queries) to reflect a change in one of them.
//
// Adding a read means adding its tag here and pairing it with the writes that
// can change it, in video-games/actions.ts. Too narrow a tag serves a stale
// page, which is why that file names the tags for every write explicitly.
export function libraryCacheTag(username: string): string {
  return `library:${username.toLowerCase()}`;
}

export function gamesTag(username: string): string {
  return `${libraryCacheTag(username)}:games`;
}

export function wishlistTag(username: string): string {
  return `${libraryCacheTag(username)}:wishlist`;
}

// Covers the follower/following lists AND the profile, because the profile
// payload carries followerCount/followingCount — a follow changes all three.
export function followsTag(username: string): string {
  return `${libraryCacheTag(username)}:follows`;
}

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

// Every library read is "one resource belonging to one user", so this helper
// owns all four things that never vary between them: the origin, the
// {API_PREFIX}/users/{username} prefix, the escaping of that user-supplied segment,
// and the cache tagging. Callers below supply only what actually differs.
//
// `resourceTag` is the narrow tag for this specific resource; the umbrella tag
// is added here so no caller can forget it.
//
// Two shapes, one implementation. Without `allowMissing` a 404 is a thrown
// error like any other bad status; with it, a 404 becomes null so the caller
// can distinguish "no such user" from "the API is unwell". Overloads (rather
// than a boolean returning `T | null` for everyone) keep the common callers
// free of a null they can never receive.
async function fetchUserResource<T>(
  username: string,
  subpath: string,
  what: string,
  resourceTag: (username: string) => string
): Promise<T>;
async function fetchUserResource<T>(
  username: string,
  subpath: string,
  what: string,
  resourceTag: (username: string) => string,
  allowMissing: true
): Promise<T | null>;
async function fetchUserResource<T>(
  username: string,
  subpath: string,
  what: string,
  resourceTag: (username: string) => string,
  allowMissing = false
): Promise<T | null> {
  // encodeURIComponent because /video-games/u/[username] puts user-shaped input
  // into these URLs: the segment is escaped rather than trusted.
  const url = `${requireLibraryApiOrigin()}${API_PREFIX}/users/${encodeURIComponent(username)}${subpath}`;
  const tags = [libraryCacheTag(username), resourceTag(username)];
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
  // A 404 while prerendering can mean the deployed API predates this code's
  // prefix, so retry once on the old one. Same self-healing shape as the follow
  // lists below: a build fetches from the API that is currently DEPLOYED, so the
  // deploy shipping the rename asks a production that has not got the new prefix
  // yet. Failing there fails the build, which stops the new API deploying, which
  // makes the next build fail identically. Costs one extra request per resource
  // on a build against a genuinely missing user, and nothing at request time.
  //
  // TEMPORARY, and the only thing left over from the rename: dead as soon as the
  // rename is live in production, since nothing serves LEGACY_API_PREFIX any
  // more. Delete this block and that constant.
  if (res.status === 404 && IS_PRERENDER) {
    const legacyUrl = url.replace(API_PREFIX, LEGACY_API_PREFIX);
    try {
      const legacyRes = await fetchWithTimeout(legacyUrl, tags);
      if (legacyRes.ok) {
        console.warn(
          `[libraryApi] ${requireLibraryApiOrigin()} 404'd ${API_PREFIX} and answered on ` +
            `${LEGACY_API_PREFIX}; it predates the prefix rename. Expected only while that ` +
            `deploy is in flight.`
        );
        return (await legacyRes.json()) as T;
      }
    } catch {
      // Fall through to the normal handling below, which reports the ORIGINAL
      // 404 rather than whatever the fallback attempt did.
    }
  }
  // An expected outcome, not a failure: /video-games/u/{username} for a
  // username nobody owns. The caller turns this into a 404 page.
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

// The library API (FastAPI/Postgres) is the only data source. The CSVs under
// api/scripts/fixtures/ are a frozen snapshot used to seed a local dev database,
// never read by the running site.
//
// `username` is required rather than defaulting to the /video-games owner:
// with /video-games/u/[username] there is no single right library to fall back
// to, and a silent default would be a bug that renders the wrong person's shelf.
//
// Play state (currentlyPlaying / lastPlayed / playingSince) arrives already
// derived by the API.
export function getGames(username: string): Promise<Game[]> {
  return fetchUserResource<Game[]>(username, "/games", "games", gamesTag);
}

export function getWishlist(username: string): Promise<WishlistGame[]> {
  return fetchUserResource<WishlistGame[]>(username, "/wishlist", "wishlist", wishlistTag);
}

// Follower/following lists, tagged followsTag: a follow changes the lists on
// BOTH users' pages, so both users' follows tags get revalidated after the
// write (see the follow actions).
//
// A 404 degrades to an empty list instead of throwing, which is what makes
// these endpoints deployable at all. `next build` prerenders /video-games
// against the CURRENTLY DEPLOYED API — production's, even from a preview
// container — so during the very deploy that ships a new public endpoint, the
// API being built against does not have it yet. Failing loudly on 404 means the
// build that would ship the endpoint cannot complete, and no later build can
// either: a deadlock, not a transient error.
//
// Safe because of the order LibraryPage fetches in. The profile read runs first
// and 404s the page for a username nobody owns, so by the time these run the
// user is known to exist — a 404 here cannot mean "no such user" and can only
// mean the route is absent. Self-healing: once this deploy is live, production
// serves the route and later builds get real data.
async function fetchFollowList(
  username: string,
  kind: "followers" | "following"
): Promise<UserSummary[]> {
  const list = await fetchUserResource<UserSummary[]>(username, `/${kind}`, kind, followsTag, true);
  if (list === null) {
    // Warn rather than stay silent: after this feature's first deploy, a 404
    // here means something genuinely wrong, and an empty follower list is
    // otherwise indistinguishable from a real one.
    console.warn(
      `[followsApi] ${requireLibraryApiOrigin()} has no /${kind} endpoint for '${username}' (404). ` +
        `Treating as empty. Expected only while deploying the endpoint for the first time.`
    );
    return [];
  }
  return list;
}

export function getFollowers(username: string): Promise<UserSummary[]> {
  return fetchFollowList(username, "followers");
}

export function getFollowing(username: string): Promise<UserSummary[]> {
  return fetchFollowList(username, "following");
}

// null = no such user, which the caller turns into a 404 page. The one a
// library page should await first: it settles whether the page exists at all
// before the shelves are worth fetching.
//
// Tagged followsTag rather than getting its own: the only fields on this
// payload that a write can change are followerCount/followingCount, so a follow
// is the only thing that needs to purge it. (Display name and username are set
// at onboarding and there is no rename endpoint — see the TODO item about what
// a rename would have to touch.) It still carries the umbrella tag, so a
// "purge everything" call reaches it.
export function getProfile(username: string): Promise<LibraryProfile | null> {
  return fetchUserResource<LibraryProfile>(username, "", "profile", followsTag, true);
}
