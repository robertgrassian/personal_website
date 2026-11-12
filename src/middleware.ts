// Next.js middleware (a Next convention: this exact filename at src/ root runs
// on every request that matches `config.matcher`). Its main job is refreshing
// the Supabase session cookie — see lib/supabase/middleware.ts. It also sends
// /produce to a state page, below.
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  PRODUCE_STATE_COOKIE,
  produceStatePath,
  resolveProduceState,
} from "@/lib/produce/resolveState";
import { stateByCode } from "@/lib/produce/states";

export async function middleware(request: NextRequest) {
  // Before updateSession, so a redirect does not pay for a Supabase round
  // trip whose refreshed cookie it would throw away.
  const produce = produceRedirect(request);
  if (produce) return produce;

  return await updateSession(request);
}

const UPPERCASE_STATE_PATH = /^\/produce\/([A-Za-z]{2})$/;

// Reading geo here instead of in the page keeps all 51 state pages static:
// only this hop is per-request. Same trade as src/app/library/page.tsx.
function produceRedirect(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  if (pathname === "/produce") {
    const code = resolveProduceState({
      cookie: request.cookies.get(PRODUCE_STATE_COOKIE)?.value,
      country: request.headers.get("x-vercel-ip-country"),
      region: request.headers.get("x-vercel-ip-country-region"),
    });
    // null renders the static picker.
    if (code === null) return null;
    // 307, not permanent: the answer depends on who is asking.
    return NextResponse.redirect(new URL(produceStatePath(code), request.url), 307);
  }

  // dynamicParams = false would 404 a hand-typed /produce/NY.
  const match = UPPERCASE_STATE_PATH.exec(pathname);
  if (match && match[1] !== match[1].toLowerCase() && stateByCode(match[1])) {
    return NextResponse.redirect(new URL(produceStatePath(match[1]), request.url), 308);
  }

  return null;
}

export const config = {
  // Run on all paths EXCEPT static assets, images, and the API proxy — the
  // first two matching Supabase's recommended matcher. Excluding them avoids
  // pointless refresh work on every asset request.
  //
  // `api/library` is our own addition, and worth keeping excluded.
  // next.config.ts rewrites that prefix to FastAPI, and those calls
  // authenticate with an explicit
  // `Authorization: Bearer` header verified against Supabase's JWKS — they never
  // read the session cookie, so refreshing it does nothing for them. Matching
  // them would put a network round trip to Supabase Auth (updateSession ->
  // getUser) in front of every browser call to the API.
  //
  // This list has to be kept in step with API_PREFIX by hand: the matcher is
  // read at build time and cannot reference a runtime import. Getting it wrong
  // fails SILENTLY — the API keeps working, every call just pays for a session
  // refresh it never uses.
  matcher: [
    "/((?!api/library|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
