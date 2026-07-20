// Next.js middleware (a Next convention: this exact filename at src/ root runs
// on every request that matches `config.matcher`). Its sole job here is
// refreshing the Supabase session cookie — see lib/supabase/middleware.ts.
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on all paths EXCEPT static assets and images — matching Supabase's
  // recommended matcher. Excluding them avoids pointless refresh work on every
  // asset request. `_next/static`, `_next/image`, favicon, and common image
  // extensions are skipped.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
