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

export type MyProfile = {
  username: string;
  displayName: string;
};

// Discriminated result for the onboarding write: either the created profile,
// or a typed failure the UI can branch on without parsing message strings.
export type CreateProfileResult =
  | { ok: true; profile: MyProfile }
  | { ok: false; reason: "taken" | "invalid" | "at_capacity" | "unknown"; message: string };

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

function apiOrigin(): string {
  // The authenticated /me/* path always needs an absolute origin for the
  // server-side fetch to FastAPI. It is DELIBERATELY resolved separately from
  // the public read path's LIBRARY_API_ORIGIN: reads stay on CSV in prod (that
  // var unset) until Phase 3, but the write path must reach the API regardless.
  //   - Dev: LIBRARY_API_ORIGIN points at the separate uvicorn process (:8000).
  //   - Prod: no separate process — FastAPI is a serverless function on the
  //     same deployment. We target VERCEL_PROJECT_PRODUCTION_URL (the public
  //     production domain, e.g. rgrassian.com) rather than VERCEL_URL. This is
  //     load-bearing: VERCEL_URL is the per-deployment *.vercel.app hostname,
  //     which Vercel Deployment Protection gates *even when the custom domain
  //     is public* — so a self-call to VERCEL_URL would get the SSO wall (HTML)
  //     instead of our JSON and every signup's onboarding would break.
  const explicit = process.env.LIBRARY_API_ORIGIN?.trim();
  if (explicit) return explicit;
  const prodDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prodDomain) return `https://${prodDomain}`;
  // Neither available: a real misconfiguration — fail loudly, never silently.
  throw new Error(
    "No API origin for the authenticated write path: set LIBRARY_API_ORIGIN " +
      "(local: http://127.0.0.1:8000), or rely on VERCEL_PROJECT_PRODUCTION_URL " +
      "in a Vercel deploy."
  );
}

/** The caller's profile, or null when they're authenticated but haven't
 *  completed onboarding yet (the API returns 404 for that state). */
export async function fetchMyProfile(): Promise<MyProfile | null> {
  const token = await accessToken();
  if (!token) return null;

  const res = await fetch(`${apiOrigin()}/api/py/me/profile`, {
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

/** Complete onboarding by creating the caller's profile. Maps FastAPI's status
 *  codes to the typed CreateProfileResult (409 taken, 422 invalid, 403 cap). */
export async function createMyProfile(
  username: string,
  displayName: string
): Promise<CreateProfileResult> {
  const token = await accessToken();
  if (!token) {
    return { ok: false, reason: "unknown", message: "You are not signed in." };
  }

  const res = await fetch(`${apiOrigin()}/api/py/me/profile`, {
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
  return { ok: false, reason: "unknown", message: detail ?? "Something went wrong." };
}

// Simple ok/error result for game mutations — no reason discrimination yet
// because the rating UI only shows a message; add reasons when a caller
// actually branches on them.
export type MutateGameResult = { ok: true } | { ok: false; message: string };

/** Shared mechanics for the game/session mutations: token, JSON body, and the
 *  ok/message mapping. `what` names the operation in fallback error text. */
async function mutateGame(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
  what: string
): Promise<MutateGameResult> {
  const token = await accessToken();
  if (!token) {
    return { ok: false, message: "You are not signed in." };
  }

  const res = await fetch(`${apiOrigin()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
