// Session-refresh helper invoked from src/middleware.ts on every matched
// request. @supabase/ssr relies on middleware to keep the session alive:
// access tokens are short-lived (~1h), and without this refresh they go stale
// and server-side reads start seeing a logged-out user. Small file,
// load-bearing.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Start from a pass-through response; the client below may attach refreshed
  // session cookies to it.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write refreshed cookies onto BOTH the request (so downstream
          // handlers in this same pass see them) and a fresh response (so the
          // browser receives the Set-Cookie). This dual-write is the exact
          // shape @supabase/ssr documents — deviating from it silently breaks
          // refresh, so it's kept verbatim.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getClaims()/getUser() must be called with no intervening logic
  // between client creation and this call — it triggers the token refresh.
  // Do not add code above this that reads the session.
  await supabase.auth.getUser();

  return supabaseResponse;
}
