// OAuth callback (Route Handler). The Google sign-in flow (signInWithOAuth on
// the login page) sends the user to Google, then back here with a `code`.
// exchangeCodeForSession trades that code — together with the PKCE verifier
// @supabase/ssr stashed in a cookie — for a session, and because this runs in
// a Route Handler the server client CAN write the httpOnly session cookies.
//
// This is the OAuth analogue of /auth/confirm (which handles the magic-link
// token_hash flow): different inbound param (`code` vs `token_hash`), different
// exchange call, same "establish the session server-side, then redirect" shape.
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Open-redirect guard, identical to /auth/confirm: only a local path is
  // accepted for post-login navigation.
  const nextParam = searchParams.get("next");
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/onboarding";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Missing code, or the exchange failed (expired/replayed code, provider
  // error) → back to login with a friendly flag.
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
