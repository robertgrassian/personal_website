// Server-only client for the authenticated /me/* FastAPI endpoints.
//
// The "Next as BFF" boundary applies to WRITES: every mutation goes through a
// Server Action → this module → FastAPI, because the cache invalidation
// (revalidateTag) can only run on the Next server and must live next to the
// write. This module does the cookie → Authorization: Bearer translation for
// those server-side calls.
//
// Authenticated per-viewer READS are a separate, deliberate pattern: client
// components may call /api/py/me/* directly with the token from the browser
// Supabase client (e.g. useViewerRelationship) — the session is readable in the
// browser by design of @supabase/ssr, and read-only calls need no
// revalidation. Writes never take that path.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireLibraryApiOrigin, targetsForeignEnvironmentApi } from "@/lib/libraryApi";
import type { IgdbSearchResult, NewGame } from "@/lib/games";
import type { NewWishlistItem } from "@/lib/wishlist";

export type MyProfile = {
  username: string;
  displayName: string;
};

// Discriminated result for the onboarding write: either the created profile,
// or a typed failure the UI can branch on without parsing message strings.
export type CreateProfileResult =
  | { ok: true; profile: MyProfile }
  | {
      ok: false;
      reason: "taken" | "invalid" | "at_capacity" | "rate_limited" | "unknown";
      message: string;
    };

async function accessToken(): Promise<string | null> {
  const supabase = await createClient();
  // getSession reads the token from the cookie (refreshed by middleware). The
  // token's authenticity isn't trusted here anyway — FastAPI re-verifies it
  // via JWKS — so this is purely "do we have one to forward?".
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// The write path shares the read path's origin resolver (requireLibraryApiOrigin,
// imported above): explicit LIBRARY_API_ORIGIN, else the Vercel production
// domain. See that function for the VERCEL_URL caveat.

// Refused-write message, shared by every mutation below. A preview deploy that
// self-resolved its origin points at PRODUCTION's API, so an unguarded write
// there would mutate the real library — and the API's own forbid_in_preview
// can't catch it (see targetsForeignEnvironmentApi). Every write funnels
// through this check before its fetch.
const FOREIGN_API_WRITE_MESSAGE =
  "Writes are disabled on preview deployments — this deploy reads production's " +
  "library, so a write here would change the real thing.";

// How long to wait on the Node→Python self-call before giving up, so a hung hop
// fails fast instead of stalling the render until the function timeout. The two
// wider budgets exist because those endpoints proxy somebody else's network:
// IGDB is one upstream hop, genres is two (Wikipedia, then Wikidata).
const TIMEOUT_MS = { default: 5_000, igdb: 10_000, genres: 15_000 };

// Outcome of one /me/* call. `status` rides along on both arms so callers that
// care (createMyProfile's 409/422/403/429 map, fetchMyProfile's 404) can branch
// on the code instead of parsing message strings.
type ApiCall<T> =
  | { ok: true; status: number; data: T }
  // `detail` is FastAPI's own message when it sent a usable one, kept separate
  // from `message` so a caller with better per-status wording than the generic
  // fallback can tell the two apart.
  | { ok: false; status: number; message: string; detail?: string };

type CallOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  // null sends no body at all — DELETEs, and the POSTs that carry everything in
  // the path (follow/unfollow).
  body?: Record<string, unknown> | null;
  timeoutMs?: number;
  // Names the operation in fallback error text ("Couldn't ${what}").
  what: string;
  // Whether a preview deploy pointed at production's API should refuse. True
  // for anything that mutates — including the two nominal reads that write
  // through the read path (IGDB token cache, rate-limit counters). Only the
  // genuinely read-only profile fetch opts out.
  refuseOnForeignApi?: boolean;
};

/** The one place the /me/* call shape lives: preview guard, cookie→Bearer
 *  translation, JSON body, timeout, and FastAPI's error `detail` extraction.
 *  Every exported function below is a thin mapping on top of this. */
async function callMeApi<T>(path: string, options: CallOptions): Promise<ApiCall<T>> {
  const { method = "GET", body = null, timeoutMs = TIMEOUT_MS.default, what } = options;
  const refuseOnForeignApi = options.refuseOnForeignApi ?? true;

  if (refuseOnForeignApi && targetsForeignEnvironmentApi()) {
    return { ok: false, status: 0, message: FOREIGN_API_WRITE_MESSAGE };
  }
  const token = await accessToken();
  if (!token) {
    return { ok: false, status: 0, message: "You are not signed in." };
  }

  const res = await fetch(`${requireLibraryApiOrigin()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== null && { "Content-Type": "application/json" }),
    },
    ...(body !== null && { body: JSON.stringify(body) }),
    cache: "no-store", // per-viewer, never cached
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.ok) {
    // 204 (every DELETE) has no body to parse, and the mutations ignore `data`
    // anyway — so a missing or unparseable body is not an error here, only an
    // absent value.
    const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
    return { ok: true, status: res.status, data: data as T };
  }

  // FastAPI's detail is a string for our domain errors (404/409) but an array
  // of validation objects for 422s — only surface it when it's a plain string.
  const detail = await res
    .json()
    .then((b) => (typeof b?.detail === "string" ? b.detail : undefined))
    .catch(() => undefined);
  return {
    ok: false,
    status: res.status,
    message: detail ?? `Couldn't ${what} (HTTP ${res.status}).`,
    detail,
  };
}

/** The caller's profile, or null when they're authenticated but haven't
 *  completed onboarding yet (the API returns 404 for that state). */
export async function fetchMyProfile(): Promise<MyProfile | null> {
  // The one genuinely read-only /me call, so no preview refusal.
  const res = await callMeApi<MyProfile>("/api/py/me/profile", {
    what: "load your profile",
    refuseOnForeignApi: false,
  });
  if (res.ok) return res.data;
  // 404 = no profile yet → onboarding. 0 = no token, i.e. signed out.
  if (res.status === 404 || res.status === 0) return null;
  // Anything else is the API being unwell, which the caller should not paper
  // over as "not onboarded".
  throw new Error(`GET /me/profile failed: ${res.status} (${res.message})`);
}

// Memoized user id → username, so the write path doesn't pay a Node→Python
// round trip just to learn whose cache tag to purge. Every mutation needs the
// answer (revalidateMyLibrary in video-games/actions.ts) and the answer never
// changes: usernames are assigned once at onboarding and there is no rename
// endpoint.
//
// Module scope, so it survives across requests within one serverless instance
// and is repopulated for free after a cold start. Bounded by MAX_USERS (100),
// and holds only a username — public data that is already on the page.
//
// IF A RENAME FEATURE EVER LANDS, THIS MUST GO (or be invalidated by it):
// a stale entry would revalidate the old username's tag, leaving the renamed
// library's pages stale instead.
const usernameByUserId = new Map<string, string>();

/** The caller's username, or null when signed out / not onboarded.
 *
 *  Same answer as `fetchMyProfile()?.username`, but usually free: the session
 *  read is a local cookie parse, and only the first call per user per instance
 *  reaches the API.
 *
 *  ONLY SAFE AFTER A WRITE THE API ALREADY ACCEPTED. The map is keyed on the
 *  user id from getSession(), which reads the cookie without verifying the JWT
 *  — so on a warm entry this returns a username derived from unverified input,
 *  where fetchMyProfile() would have had FastAPI verify the token first. Every
 *  current caller sits behind an `if (result.ok)` on a mutation FastAPI
 *  accepted, which is what makes the shortcut sound: a forged cookie never
 *  reaches this code, because the write it would have to accompany fails 401
 *  first. Call this somewhere that is not gated that way and a forged cookie
 *  picks which user's cache tag gets purged. */
export async function fetchMyUsername(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const cached = usernameByUserId.get(session.user.id);
  if (cached) return cached;

  const profile = await fetchMyProfile();
  // Nothing cached for the not-onboarded state: it is precisely the one that
  // changes, and it changes to a value we would then be serving wrong.
  if (!profile) return null;

  usernameByUserId.set(session.user.id, profile.username);
  return profile.username;
}

/** Complete onboarding by creating the caller's profile. Maps FastAPI's status
 *  codes to the typed CreateProfileResult (409 taken, 422 invalid, 403 cap,
 *  429 rate-limited). */
export async function createMyProfile(
  username: string,
  displayName: string
): Promise<CreateProfileResult> {
  const res = await callMeApi<MyProfile>("/api/py/me/profile", {
    method: "POST",
    body: { username, displayName },
    what: "create your profile",
  });
  if (res.ok) return { ok: true, profile: res.data };

  const mapped = PROFILE_ERRORS[res.status];
  if (mapped) {
    return { ok: false, reason: mapped.reason, message: res.detail ?? mapped.fallback };
  }
  // Includes the two no-request refusals (preview deploy, signed out), which
  // arrive as status 0 carrying their own message.
  return { ok: false, reason: "unknown", message: res.detail ?? res.message };
}

// FastAPI's status codes for POST /me/profile, mapped to the typed reasons the
// onboarding UI branches on plus the wording to use when the API sent no usable
// detail of its own.
//
// 429 is in here because profile creation is a charged write like any other
// (rate_limit_writes guards it), so onboarding can be rate-limited too — rare,
// but without it that surfaced as the generic "Something went wrong", which
// reads as broken rather than "wait a moment".
const PROFILE_ERRORS: Record<
  number,
  { reason: "taken" | "invalid" | "at_capacity" | "rate_limited"; fallback: string }
> = {
  409: { reason: "taken", fallback: "That username is taken." },
  422: { reason: "invalid", fallback: "That username isn't allowed." },
  403: { reason: "at_capacity", fallback: "Signups are currently at capacity." },
  429: { reason: "rate_limited", fallback: "Too many attempts, wait a moment and try again." },
};

// Simple ok/error result for /me mutations — no reason discrimination yet
// because the callers only show a message; add reasons when one actually
// branches on them.
export type MutateResult = { ok: true } | { ok: false; message: string };

/** Shared mechanics for every /me mutation (games, sessions, wishlist, follows):
 *  token, JSON body, and the ok/message mapping. `what` names the operation in
 *  fallback error text. DELETE sends no body (the API answers 204). */
async function mutate(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown> | null,
  what: string
): Promise<MutateResult> {
  const res = await callMeApi<void>(path, { method, body, what });
  return res.ok ? { ok: true } : { ok: false, message: res.message };
}

/** Add a game to the caller's library. `rating: ""` and `igdbId: null` etc.
 *  are sent as-is — the API treats ""/null as absent for optional fields. */
export function createMyGame(game: NewGame): Promise<MutateResult> {
  return mutate("/api/py/me/games", "POST", { ...game }, "add the game");
}

/** Remove a game (and, server-side via cascade, its play sessions). */
export function deleteMyGame(gameId: number): Promise<MutateResult> {
  return mutate(`/api/py/me/games/${gameId}`, "DELETE", null, "delete the game");
}

/** Add a wishlist entry. */
export function createMyWishlistItem(item: NewWishlistItem): Promise<MutateResult> {
  return mutate("/api/py/me/wishlist", "POST", { ...item }, "add to the wishlist");
}

/** Partially edit a wishlist entry — pass only the fields to change
 *  (PATCH semantics: absent = leave unchanged; system "" = undecided). */
export function updateMyWishlistItem(
  itemId: number,
  fields: { starred?: boolean; notes?: string; system?: string }
): Promise<MutateResult> {
  return mutate(`/api/py/me/wishlist/${itemId}`, "PATCH", fields, "update the wishlist");
}

/** Remove a wishlist entry. */
export function deleteMyWishlistItem(itemId: number): Promise<MutateResult> {
  return mutate(`/api/py/me/wishlist/${itemId}`, "DELETE", null, "remove from the wishlist");
}

/** Promote a wishlist entry into the library ("I bought it"). `system` wins
 *  over the stored one; "" defers to what the wishlist row already has. */
export function promoteMyWishlistItem(itemId: number, system: string): Promise<MutateResult> {
  return mutate(`/api/py/me/wishlist/${itemId}/promote`, "POST", { system }, "move to the library");
}

// Search results ride in the ok branch; failures reuse the message shape so
// the modal can render either with one code path.
export type SearchIgdbResult =
  | { ok: true; results: IgdbSearchResult[]; hasMore: boolean }
  | { ok: false; message: string };

/** Search IGDB through the authenticated proxy (rate-limited server-side).
 *  `page` walks further down the same result list for the picker's "show
 *  more"; `hasMore` in the response says whether asking for the next one is
 *  worth it, so no page arithmetic happens on this side. */
export async function searchIgdb(query: string, page = 1): Promise<SearchIgdbResult> {
  // Nominally a read, but the proxy writes through it (token cache, rate-limit
  // counters), so it keeps the mutations' preview refusal (the callMeApi
  // default).
  const res = await callMeApi<{ results: IgdbSearchResult[]; hasMore: boolean }>(
    `/api/py/igdb/search?q=${encodeURIComponent(query)}&page=${page}`,
    { what: "search", timeoutMs: TIMEOUT_MS.igdb }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, results: res.data.results, hasMore: res.data.hasMore };
}

// Genre lookup rides the same ok/message shape as the IGDB search above.
export type LookupGenresResult =
  | { ok: true; genres: string[]; article: string }
  | { ok: false; message: string };

/** Genres for one title from Wikipedia/Wikidata, via the authenticated proxy.
 *
 *  Called after a game is picked in the add-game modal rather than for every
 *  search result: IGDB identifies the game, this says what it actually is.
 *  IGDB's own genres are too coarse to describe a library (no roguelike on
 *  Hades II, no metroidvania on Animal Well), which is why the add flow asks
 *  here instead of using the genres the search already returned. */
export async function lookupGenres(name: string): Promise<LookupGenresResult> {
  // Nominally a read, but it writes rate-limit counters through the read path,
  // so it keeps the mutations' preview refusal (the callMeApi default).
  const res = await callMeApi<{ genres: string[]; article: string }>(
    `/api/py/genres/lookup?name=${encodeURIComponent(name)}`,
    { what: "look up genres", timeoutMs: TIMEOUT_MS.genres }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, genres: res.data.genres, article: res.data.article };
}

/** Set or clear ("" = unrated) the rating on one of the caller's games. */
export function updateMyGameRating(gameId: number, rating: string): Promise<MutateResult> {
  return mutate(`/api/py/me/games/${gameId}`, "PATCH", { rating }, "update the rating");
}

/** Start playing (endDate null → open session) or log a past playthrough
 *  (both dates) on one of the caller's games. Dates are YYYY-MM-DD. */
export function createMySession(
  gameId: number,
  startDate: string,
  endDate: string | null
): Promise<MutateResult> {
  return mutate(
    `/api/py/me/games/${gameId}/sessions`,
    "POST",
    { startDate, endDate },
    "log the session"
  );
}

/** Close an open session ("stop playing"). When `rating` is passed it is
 *  applied to the game in the same transaction (rate-on-stop); undefined
 *  leaves the rating untouched. */
export function closeMySession(
  sessionId: number,
  endDate: string,
  rating?: string
): Promise<MutateResult> {
  // Omit the rating key entirely when not rating — the API's PATCH semantics
  // treat an absent field as "leave unchanged" and null/"" as "clear".
  const body: Record<string, unknown> = rating === undefined ? { endDate } : { endDate, rating };
  return mutate(`/api/py/me/sessions/${sessionId}`, "PATCH", body, "stop the session");
}

/** Follow / unfollow a user. Both are idempotent server-side, so a
 *  double-fired toggle is a 204 rather than a conflict the UI must explain.
 *  The username is escaped: it comes from a link the viewer clicked, and the
 *  API answers 404 for anything that isn't a real user. */
export function followUser(username: string): Promise<MutateResult> {
  return mutate(
    `/api/py/me/following/${encodeURIComponent(username)}`,
    "POST",
    null,
    "follow this user"
  );
}

export function unfollowUser(username: string): Promise<MutateResult> {
  return mutate(
    `/api/py/me/following/${encodeURIComponent(username)}`,
    "DELETE",
    null,
    "unfollow this user"
  );
}
