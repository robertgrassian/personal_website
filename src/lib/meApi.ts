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
import { getLibraryApiOrigin } from "@/lib/libraryApi";

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
  const origin = getLibraryApiOrigin();
  if (!origin) {
    // Same loud-failure stance as libraryApi.ts: a configured-but-missing
    // origin should be obvious in dev, never a silent no-op.
    throw new Error(
      "LIBRARY_API_ORIGIN is not set — the authenticated API path needs it. " +
        "Set it in .env (local: http://127.0.0.1:8000)."
    );
  }
  return origin;
}

/** The caller's profile, or null when they're authenticated but haven't
 *  completed onboarding yet (the API returns 404 for that state, spec §5.2). */
export async function fetchMyProfile(): Promise<MyProfile | null> {
  const token = await accessToken();
  if (!token) return null;

  const res = await fetch(`${apiOrigin()}/api/py/me/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", // per-viewer, never cached (spec §7.2)
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
