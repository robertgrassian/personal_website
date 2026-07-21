import { type NextRequest } from "next/server";

// The origin (protocol + host) the request actually arrived on, for building
// post-auth redirects.
//
// Why not `new URL(request.url).origin`: in Next dev that normalizes to
// `localhost` even when the request came in on `127.0.0.1`, so a redirect built
// from it strands the just-set session cookie (which is scoped to the real
// host) and the user bounces back to /login. Reading the forwarded/Host header
// preserves the exact host — 127.0.0.1 or localhost locally, the real domain in
// production (Vercel sets x-forwarded-host / x-forwarded-proto).
export function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (/^(localhost|127\.|\[?::1)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
