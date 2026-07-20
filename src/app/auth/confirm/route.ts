// Magic-link callback (Route Handler — a Next convention: a `route.ts`
// exporting HTTP verb functions is an API endpoint, not a page). The email
// link built by supabase/templates/magic_link.html lands here with a
// token_hash; verifyOtp exchanges it for a session, and because this runs in
// a Route Handler the server client CAN write cookies — so the httpOnly
// session lands where middleware and Server Components can read it.
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Where to send the user after a successful sign-in. Defaults to
  // /onboarding, which self-resolves: it shows the username picker for a new
  // account and redirects an already-onboarded user onward. (The dedicated
  // /library resolver from spec §7.1 arrives in Phase 4.)
  const next = searchParams.get("next") ?? "/onboarding";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Invalid or expired link → a friendly error page rather than a raw 4xx.
  return NextResponse.redirect(`${origin}/login?error=link_invalid`);
}
