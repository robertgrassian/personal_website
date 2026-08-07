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
// token refresh timer, and a library page calls this three times (twice in
// AuthButton, once in useViewerRelationship). Separate instances would mean
// several schedulers refreshing one shared session.
//
// Module scope is per-tab in the browser, which is the right lifetime here.
// This module is browser-only by contract (see above), so a module-level
// singleton raises none of the request-sharing hazards it would on the server.

// The singleton's type comes from this factory rather than from
// `typeof createBrowserClient`: that function is generic over the database
// schema, and ReturnType on the unapplied generic widens its callbacks to `any`,
// which strips the types off onAuthStateChange's parameters at every call site.
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
