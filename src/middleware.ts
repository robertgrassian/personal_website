// Next.js middleware (a Next convention: this exact filename at src/ root runs
// on every request that matches `config.matcher`). Its sole job here is
// refreshing the Supabase session cookie — see lib/supabase/middleware.ts.
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on all paths EXCEPT static assets, images, and the API proxy — the
  // first two matching Supabase's recommended matcher. Excluding them avoids
  // pointless refresh work on every asset request.
  //
  // `api/py` is our own addition, and worth keeping excluded. next.config.ts
  // rewrites that prefix to FastAPI, and those calls authenticate with an
  // explicit `Authorization: Bearer` header verified against Supabase's JWKS —
  // they never read the session cookie, so refreshing it does nothing for them.
  // Matching them would put a network round trip to Supabase Auth
  // (updateSession -> getUser) in front of every browser call to the API.
  matcher: [
    "/((?!api/py|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
