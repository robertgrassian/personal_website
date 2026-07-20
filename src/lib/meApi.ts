// Server-only client for the authenticated /me/* FastAPI endpoints.
//
// The "Next as BFF" boundary (spec §7.2, decision #18): the browser never
// calls FastAPI directly for authenticated actions. Instead a Server Component
// or Server Action reads the httpOnly session cookie here, forwards the
// request to FastAPI with the access token as a Bearer header, and FastAPI
// verifies it via JWKS. Keeping the token server-side (never handed to client
// JS) is the whole point of the httpOnly session.
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
 *  completed onboarding yet (the API returns 404 for that state, spec §5.2). */
export async function fetchMyProfile(): Promise<MyProfile | null> {
  const token = await accessToken();
  if (!token) return null;

  const res = await fetch(`${apiOrigin()}/api/py/me/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", // per-viewer, never cached (spec §7.2)
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
