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
// Supabase client (e.g. useIsLibraryOwner) — the session is readable in the
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

/** The caller's profile, or null when they're authenticated but haven't
 *  completed onboarding yet (the API returns 404 for that state). */
export async function fetchMyProfile(): Promise<MyProfile | null> {
  const token = await accessToken();
  if (!token) return null;

  const res = await fetch(`${requireLibraryApiOrigin()}/api/py/me/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", // per-viewer, never cached
    // Bound the Node→Python self-call so a hung hop fails fast instead of
    // stalling the render until the function timeout.
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) return null; // no profile yet → onboarding
  if (!res.ok) {
    throw new Error(`GET /me/profile failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as MyProfile;
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
  if (targetsForeignEnvironmentApi()) {
    return { ok: false, reason: "unknown", message: FOREIGN_API_WRITE_MESSAGE };
  }
  const token = await accessToken();
  if (!token) {
    return { ok: false, reason: "unknown", message: "You are not signed in." };
  }

  const res = await fetch(`${requireLibraryApiOrigin()}/api/py/me/profile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, displayName }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });

  if (res.ok) {
    return { ok: true, profile: (await res.json()) as MyProfile };
  }

  const detail = await res
    .json()
    .then((b) => b?.detail as string | undefined)
    .catch(() => undefined);

  if (res.status === 409) {
    return { ok: false, reason: "taken", message: detail ?? "That username is taken." };
  }
  if (res.status === 422) {
    return { ok: false, reason: "invalid", message: detail ?? "That username isn't allowed." };
  }
  if (res.status === 403) {
    return {
      ok: false,
      reason: "at_capacity",
      message: detail ?? "Signups are currently at capacity.",
    };
  }
  if (res.status === 429) {
    // Profile creation is a charged write like any other (rate_limit_writes
    // guards it), so onboarding can be rate-limited too — rare, but without
    // this it surfaced as the generic "Something went wrong", which reads as
    // broken rather than "wait a moment".
    return {
      ok: false,
      reason: "rate_limited",
      message: detail ?? "Too many attempts — wait a moment and try again.",
    };
  }
  return { ok: false, reason: "unknown", message: detail ?? "Something went wrong." };
}

// Simple ok/error result for game mutations — no reason discrimination yet
// because the rating UI only shows a message; add reasons when a caller
// actually branches on them.
export type MutateGameResult = { ok: true } | { ok: false; message: string };

/** Shared mechanics for the game/session mutations: token, JSON body, and the
 *  ok/message mapping. `what` names the operation in fallback error text.
 *  DELETE sends no body (the API answers 204). */
async function mutateGame(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown> | null,
  what: string
): Promise<MutateGameResult> {
  if (targetsForeignEnvironmentApi()) {
    return { ok: false, message: FOREIGN_API_WRITE_MESSAGE };
  }
  const token = await accessToken();
  if (!token) {
    return { ok: false, message: "You are not signed in." };
  }

  const res = await fetch(`${requireLibraryApiOrigin()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== null && { "Content-Type": "application/json" }),
    },
    ...(body !== null && { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });

  if (res.ok) return { ok: true };

  // FastAPI's detail is a string for our domain errors (404/409) but an array
  // of validation objects for 422s — only surface it when it's a plain string.
  const detail = await res
    .json()
    .then((b) => (typeof b?.detail === "string" ? b.detail : undefined))
    .catch(() => undefined);
  return { ok: false, message: detail ?? `Couldn't ${what} (HTTP ${res.status}).` };
}

/** Add a game to the caller's library. `rating: ""` and `igdbId: null` etc.
 *  are sent as-is — the API treats ""/null as absent for optional fields. */
export function createMyGame(game: NewGame): Promise<MutateGameResult> {
  return mutateGame("/api/py/me/games", "POST", { ...game }, "add the game");
}

/** Remove a game (and, server-side via cascade, its play sessions). */
export function deleteMyGame(gameId: number): Promise<MutateGameResult> {
  return mutateGame(`/api/py/me/games/${gameId}`, "DELETE", null, "delete the game");
}

/** Add a wishlist entry. */
export function createMyWishlistItem(item: NewWishlistItem): Promise<MutateGameResult> {
  return mutateGame("/api/py/me/wishlist", "POST", { ...item }, "add to the wishlist");
}

/** Partially edit a wishlist entry — pass only the fields to change
 *  (PATCH semantics: absent = leave unchanged; system "" = undecided). */
export function updateMyWishlistItem(
  itemId: number,
  fields: { starred?: boolean; notes?: string; system?: string }
): Promise<MutateGameResult> {
  return mutateGame(`/api/py/me/wishlist/${itemId}`, "PATCH", fields, "update the wishlist");
}

/** Remove a wishlist entry. */
export function deleteMyWishlistItem(itemId: number): Promise<MutateGameResult> {
  return mutateGame(`/api/py/me/wishlist/${itemId}`, "DELETE", null, "remove from the wishlist");
}

/** Promote a wishlist entry into the library ("I bought it"). `system` wins
 *  over the stored one; "" defers to what the wishlist row already has. */
export function promoteMyWishlistItem(itemId: number, system: string): Promise<MutateGameResult> {
  return mutateGame(
    `/api/py/me/wishlist/${itemId}/promote`,
    "POST",
    { system },
    "move to the library"
  );
}

// Search results ride in the ok branch; failures reuse the message shape so
// the modal can render either with one code path.
export type SearchIgdbResult =
  | { ok: true; results: IgdbSearchResult[] }
  | { ok: false; message: string };

/** Search IGDB through the authenticated proxy (rate-limited server-side). */
export async function searchIgdb(query: string): Promise<SearchIgdbResult> {
  // Nominally a read, but the proxy writes through it (token cache, rate-limit
  // counters), so it gets the same refusal as the mutations.
  if (targetsForeignEnvironmentApi()) {
    return { ok: false, message: FOREIGN_API_WRITE_MESSAGE };
  }
  const token = await accessToken();
  if (!token) {
    return { ok: false, message: "You are not signed in." };
  }

  const res = await fetch(
    `${requireLibraryApiOrigin()}/api/py/igdb/search?q=${encodeURIComponent(query)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000), // upstream hop to IGDB can be slower
    }
  );

  if (res.ok) {
    return { ok: true, results: (await res.json()) as IgdbSearchResult[] };
  }
  const detail = await res
    .json()
    .then((b) => (typeof b?.detail === "string" ? b.detail : undefined))
    .catch(() => undefined);
  return { ok: false, message: detail ?? `Search failed (HTTP ${res.status}).` };
}

/** Set or clear ("" = unrated) the rating on one of the caller's games. */
export function updateMyGameRating(gameId: number, rating: string): Promise<MutateGameResult> {
  return mutateGame(`/api/py/me/games/${gameId}`, "PATCH", { rating }, "update the rating");
}

/** Start playing (endDate null → open session) or log a past playthrough
 *  (both dates) on one of the caller's games. Dates are YYYY-MM-DD. */
export function createMySession(
  gameId: number,
  startDate: string,
  endDate: string | null
): Promise<MutateGameResult> {
  return mutateGame(
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
): Promise<MutateGameResult> {
  // Omit the rating key entirely when not rating — the API's PATCH semantics
  // treat an absent field as "leave unchanged" and null/"" as "clear".
  const body: Record<string, unknown> = rating === undefined ? { endDate } : { endDate, rating };
  return mutateGame(`/api/py/me/sessions/${sessionId}`, "PATCH", body, "stop the session");
}
