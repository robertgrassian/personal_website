// Supabase browser client — for Client Components only ("use client").
//
// @supabase/ssr splits the client in two: this browser variant stores the
// session in cookies the middleware can refresh (src/middleware.ts), and a
// server variant (./server.ts) reads those cookies in Server Components /
// Actions / Route Handlers. This is the in-the-browser half of the auth SDK;
// anything touching cookies on the server uses the other half.
//
// Both env vars are NEXT_PUBLIC_ by design: the anon key and project URL are
// public — the browser needs them for the OAuth / magic-link dance. The
// service-role key is a different, server-only secret and never appears here.
import { createBrowserClient } from "@supabase/ssr";

// One client per browser tab, not one per call. A GoTrue client is not a thin
// wrapper: each instance registers its own storage event listener and its own
// token refresh timer. There are at least two callers on every library page
// (AuthButton and FollowStateProvider), so returning a fresh one each time meant
// duplicate schedulers racing to refresh the same session.
//
// Module scope is per-tab in the browser, which is the right lifetime here.
// This module is browser-only by contract (see above), so there is no
// server-side request-sharing hazard of the kind a module-level singleton would
// otherwise raise.
// Typed off this factory rather than off `typeof createBrowserClient` directly:
// that function is generic over the database schema, and ReturnType on the
// unapplied generic collapses its callbacks to `any` — which showed up as
// implicit-any errors on onAuthStateChange's parameters in AuthButton.
function newBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

let browserClient: ReturnType<typeof newBrowserClient> | null = null;

export function createClient() {
  browserClient ??= newBrowserClient();
  return browserClient;
}
