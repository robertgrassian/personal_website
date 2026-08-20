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
import type { CatalogPreview, IgdbSearchResult, NewGame } from "@/lib/games";
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
// fails fast instead of stalling the render until the function timeout. The
// wider igdb budget exists because that endpoint proxies somebody else's
// network, so it carries an upstream round trip inside our own.
//
// `add` is wider still, and the number is not arbitrary: creating a catalog row
// runs a Wikipedia lookup inside the POST (services/me.py), which is two
// sequential requests at the genre service's 8s ceiling each. This deadline MUST
// stay above that worst case. Below it, Next aborts a request the API goes on to
// commit, and the user is told the add failed while the game is on the shelf —
// with no revalidateTag, so the shelf does not even show it.
const TIMEOUT_MS = { default: 5_000, igdb: 10_000, add: 20_000 };

// Outcome of one /me/* call. `status` rides along on both arms so callers that
// care (createMyProfile's 409/422/403/429 map, fetchMyProfile's 404) can branch
// on the code instead of parsing message strings.
type ApiCall<T> =
  | { ok: true; status: number; data: T }
  // `detail` is FastAPI's own message when it sent a usable one, kept separate
  // from `message` so a caller with better per-status wording than the generic
  // fallback can tell the two apart.
  //
  // `unreachable` marks the one failure that is not an answer: the request was
  // sent and no response came back (timeout, connection refused, DNS). It has
  // to be distinguishable from the status-0 refusals we generate ourselves
  // BEFORE sending anything (signed out, preview deploy), because those two
  // mean "nothing happened" while this one means "the outcome is unknown" —
  // the API may well have committed the write and only the answer went
  // missing. fetchMyProfile in particular used to read status 0 as "not
  // signed in", which would have turned a slow hop into a silent sign-out.
  | { ok: false; status: number; message: string; detail?: string; unreachable?: true };

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

  // The fetch is wrapped because AbortSignal.timeout does not resolve to a
  // response on expiry — it REJECTS with a TimeoutError, as does any transport
  // failure. Unwrapped, that exception escapes the Server Action that called
  // this, and Next surfaces a rejected action as a rejected promise on the
  // client: useServerAction awaits it, so the write reports neither success nor
  // failure and the UI simply does nothing. A silent no-op is the worst
  // possible answer for a mutation, so every transport failure is converted
  // into an ordinary result here and reported like any other.
  // Resolved before the try, not inside it: this throws a deliberately
  // actionable error when the origin is unconfigured, and catching it below
  // would reshape a deployment misconfiguration into "check your connection".
  const origin = requireLibraryApiOrigin();

  let res: Response;
  try {
    res = await fetch(`${origin}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== null && { "Content-Type": "application/json" }),
      },
      ...(body !== null && { body: JSON.stringify(body) }),
      cache: "no-store", // per-viewer, never cached
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Deliberately does not claim the change was not saved: for a write, the
    // request may have arrived and committed with only the answer lost. Telling
    // someone "that didn't work" when it did is how you get a duplicate.
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      status: 0,
      unreachable: true,
      message: timedOut
        ? `The server took too long to ${what}. It may still have gone through, ` +
          `so refresh the page before trying again.`
        : `Couldn't reach the server to ${what}. Check your connection and try again.`,
    };
  }

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
  // Checked before the status map below, not after: a hop that timed out also
  // carries status 0, and reading that as "signed out" would send a signed-in
  // owner to onboarding because the API was slow. Unknown is not absent.
  if (res.unreachable) throw new Error(`GET /me/profile did not answer: ${res.message}`);
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
// library's pages stale instead. Account deletion is the milder version of the
// same hazard and is already handled: deleteMyAccount() drops the entry.
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

/** Delete the caller's account: the auth user, the profile, and everything that
 *  cascades from it. The API answers 204, or 503 if it cannot reach the
 *  accounts service, in which case nothing was deleted.
 *
 *  Clears this user's `usernameByUserId` entry on success, rather than exposing
 *  an invalidator for callers to remember: a stale entry would keep resolving a
 *  freed username for the life of the serverless instance, and if someone
 *  re-registered it that instance would purge a stranger's cache tag. The map
 *  stays private, and the one operation that invalidates it owns the cleanup.
 *
 *  The session cookie is untouched here. It is browser state, so the caller
 *  must also sign out client-side or the UI keeps believing it is signed in. */
export async function deleteMyAccount(): Promise<MutateResult> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const result = await mutate("/api/py/me/account", "DELETE", null, "delete your account");
  if (result.ok && session) usernameByUserId.delete(session.user.id);
  return result;
}

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
  what: string,
  // Only the two create paths pass this. Everything else is a plain database
  // write and has no business taking longer than the default.
  timeoutMs?: number
): Promise<MutateResult> {
  const res = await callMeApi<void>(path, { method, body, what, timeoutMs });
  return res.ok ? { ok: true } : { ok: false, message: res.message };
}

/** Add a game to the caller's library. `rating: ""` and `igdbId: null` etc.
 *  are sent as-is — the API treats ""/null as absent for optional fields. */
export function createMyGame(game: NewGame): Promise<MutateResult> {
  return mutate("/api/py/me/games", "POST", { ...game }, "add the game", TIMEOUT_MS.add);
}

/** Remove a game (and, server-side via cascade, its play sessions). */
export function deleteMyGame(gameId: number): Promise<MutateResult> {
  return mutate(`/api/py/me/games/${gameId}`, "DELETE", null, "delete the game");
}

/** Add a wishlist entry. */
export function createMyWishlistItem(item: NewWishlistItem): Promise<MutateResult> {
  return mutate("/api/py/me/wishlist", "POST", { ...item }, "add to the wishlist", TIMEOUT_MS.add);
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
/** Promote, returning the id of the library row it created.
 *
 *  The id is the reason this does not go through `mutate`: the dialog can save
 *  a rating and a session in the same press, and both need a game id that does
 *  not exist until this call answers. The API has always sent the new game back
 *  (201 + GameRead); `mutate` is what was discarding it. */
export async function promoteMyWishlistItem(
  itemId: number,
  system: string
): Promise<PromoteResult> {
  const res = await callMeApi<{ id: number }>(`/api/py/me/wishlist/${itemId}/promote`, {
    method: "POST",
    body: { system },
    what: "move to the library",
  });
  if (!res.ok) return { ok: false, message: res.message };
  // A 201 that somehow arrived without a parseable body: the write landed, so
  // reporting failure would be a lie, but the follow-up writes have no id to
  // target. Reported as a partial success by the caller.
  if (typeof res.data?.id !== "number") return { ok: true, gameId: null };
  return { ok: true, gameId: res.data.id };
}

export type PromoteResult = { ok: true; gameId: number | null } | { ok: false; message: string };

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

// Same ok/message split as SearchIgdbResult, so the popover renders a failure
// with the code path it uses for a success.
export type CatalogPreviewResult =
  | { ok: true; preview: CatalogPreview }
  | { ok: false; message: string };

/** What a game's catalog row holds, or would hold if added now.
 *
 *  `genres` and `releaseDate` are what the client already has from IGDB, sent
 *  so the API can answer with the same fallbacks an add would use rather than
 *  a second opinion. A GET that writes rate-limit counters, so it keeps
 *  callMeApi's preview refusal like searchIgdb does. */
export async function previewCatalogEntry(
  game: Pick<CatalogPreview, "genres" | "releaseDate"> & { name: string; igdbId: number | null }
): Promise<CatalogPreviewResult> {
  const params = new URLSearchParams({ name: game.name });
  if (game.igdbId !== null) params.set("igdbId", String(game.igdbId));
  if (game.releaseDate) params.set("releaseDate", game.releaseDate);
  // camelCase is the wire convention everywhere else in this API (CamelModel
  // aliases every schema field), so the endpoint declares matching aliases
  // rather than this call site converting. FastAPI IGNORES query params it does
  // not recognize, which is how a mismatch here went unnoticed: the preview
  // silently ran as though the game had no IGDB id.
  // Repeated key per value: FastAPI reads a list query param that way, and
  // URLSearchParams would otherwise comma-join them into one genre.
  for (const genre of game.genres) params.append("genres", genre);

  const res = await callMeApi<CatalogPreview>(`/api/py/me/catalog-preview?${params}`, {
    what: "look up this game",
    timeoutMs: TIMEOUT_MS.igdb,
  });
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, preview: res.data };
}

/** Rating and system in ONE PATCH, for the dialog's single Save.
 *
 *  GameUpdate is partial on the server (it checks `model_fields_set`), so an
 *  omitted key still means "leave unchanged" and this stays a partial edit. The
 *  point is atomicity: sending both as two calls left a Save that changed both
 *  able to apply one and fail the other. Only keys actually present are sent,
 *  which is why the body is built rather than spread from a fixed shape. */
export function updateMyGame(
  gameId: number,
  fields: { rating?: string; system?: string }
): Promise<MutateResult> {
  const body: Record<string, unknown> = {};
  if (fields.rating !== undefined) body.rating = fields.rating;
  if (fields.system !== undefined) body.system = fields.system;
  return mutate(`/api/py/me/games/${gameId}`, "PATCH", body, "save your changes");
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

/** Close an open session ("stop playing"), leaving the game's rating alone.
 *
 *  The API can also rate the game in the same transaction (SessionClose carries
 *  an optional `rating`), and this used to pass one through. The UI stopped
 *  needing that when rating became a separate question asked after the session
 *  closes, so the key is now always absent, which the API's PATCH semantics
 *  read as "leave unchanged". The endpoint keeps the capability. */
export function closeMySession(sessionId: number, endDate: string): Promise<MutateResult> {
  return mutate(`/api/py/me/sessions/${sessionId}`, "PATCH", { endDate }, "stop the session");
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
