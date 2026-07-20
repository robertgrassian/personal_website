// Supabase browser client — for Client Components only ("use client").
//
// @supabase/ssr splits the client in two: this browser variant stores the
// session in cookies the middleware can refresh (src/middleware.ts), and a
// server variant (./server.ts) reads those cookies in Server Components /
// Actions / Route Handlers. React analogy from the backend world: this is the
// "in the browser" half of the auth SDK; anything touching cookies on the
// server uses the other half.
//
// Both env vars are NEXT_PUBLIC_ by design (spec §7.6): the anon key and
// project URL are public — the browser needs them for the OAuth / magic-link
// dance. The service-role key is a different, server-only secret and never
// appears here.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
