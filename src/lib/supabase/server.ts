// Supabase server client — for Server Components, Server Actions, and Route
// Handlers. Reads/writes the session cookies via Next's async cookies() store.
//
// Why a factory that must be awaited: in Next 15 `cookies()` is async, and
// each request needs its own client bound to that request's cookie store —
// unlike the browser client (a process-wide singleton is fine there). So call
// `await createClient()` inside the request, never at module top level.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Whether this deployment has the (public) Supabase credentials at all.
// Checked at call time, not module load, so it reflects the live env.
//
// Server Components that read the session must consult this first: without
// credentials createServerClient throws, and an uncaught throw in a page is a
// 500. The middleware degrades the same way (see ./middleware.ts) — together
// they keep a missing env var from taking down routes that don't need auth.
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In a Server Component the cookie store is read-only and this
          // throws; that's expected and safe to swallow because the
          // middleware (src/middleware.ts) is what actually refreshes the
          // session cookie on every request. setAll only succeeds (and
          // matters) from Server Actions and Route Handlers.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — ignore (see comment above).
          }
        },
      },
    }
  );
}
