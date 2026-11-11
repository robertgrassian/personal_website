// OAuth callback (Route Handler). The Google sign-in flow (signInWithOAuth in
// SignInPanel) sends the user to Google, then back here with a `code`.
// exchangeCodeForSession trades that code — together with the PKCE verifier
// @supabase/ssr stashed in a cookie — for a session, and because this runs in
// a Route Handler the server client CAN write the httpOnly session cookies.
//
// This is the OAuth analogue of /auth/confirm (which handles the magic-link
// token_hash flow): different inbound param (`code` vs `token_hash`), different
// exchange call, same "establish the session server-side, then redirect" shape.
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/requestOrigin";
import { safeNextPath, signInPath } from "@/lib/nextPath";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // Redirect to the host the request came in on, so the session cookie stays
  // valid (see requestOrigin). In prod this resolves to the real domain.
  const origin = requestOrigin(request);

  // The sign-in button always sends `next`; /library covers a callback that
  // arrives without one.
  const next = safeNextPath(searchParams.get("next"), "/library");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Missing code, or the exchange failed (expired/replayed code, provider
  // error) → back to sign-in with a friendly flag, still headed for `next`.
  return NextResponse.redirect(`${origin}${signInPath(next, "oauth_failed")}`);
}
