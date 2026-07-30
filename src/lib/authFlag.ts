// The "is this viewer signed in?" flag, decided BEFORE first paint.
//
// /video-games and /u/[username] are statically cached and their HTML must be
// identical for every viewer, so auth-dependent controls used to resolve after
// hydration — which paints one frame of the wrong state (the sign-up banner
// flashing at signed-in viewers, "Sign in"/"Sign out" popping in late).
//
// Instead of changing the HTML, this moves the decision earlier: a synchronous
// script (authFlagScript) reads the session cookie and stamps data-authed on
// <html> before paint, and CSS in globals.css hides the half that does not
// apply. Both halves ship to everyone, so the cache is untouched.
//
// PRESENCE CHECK, not verification — a forged cookie flips it. Fine, because
// every consumer is cosmetic and real authorization stays server-side in
// FastAPI. Never gate anything that matters on this flag.
//
// It also cannot answer "is this viewer the owner of THIS library?" — the JWT's
// `sub` is a user id, not a username, so useIsLibraryOwner still needs its
// /me/profile round trip and still resolves after hydration.

// Presence-style, so CSS matches html[data-authed] regardless of value.
export const AUTHED_ATTR = "data-authed";

// Mirrors supabase-js's own derivation. Duplicating a library internal is a
// coupling, but the loose alternative ("any sb-* cookie") is worse — see the
// code-verifier note below. Also covers local dev, where the host is 127.0.0.1
// and the key is `sb-127-auth-token`.
export function sessionCookieKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

// Source for the pre-paint <script>. Returns "" when the Supabase URL is
// missing or unparseable: the layout then renders no script and the UI falls
// back to post-hydration resolution, so the flash returns but nothing breaks. A
// Preview deploy once 500'd site-wide over a missing NEXT_PUBLIC_SUPABASE_ var.
export function authFlagScript(supabaseUrl: string | undefined): string {
  if (!supabaseUrl) return "";

  let key: string;
  try {
    key = sessionCookieKey(supabaseUrl);
  } catch {
    return "";
  }

  // JSON-encoded rather than interpolated raw: it comes from our own env var,
  // but an unescaped quote would silently break the script.
  const keyLiteral = JSON.stringify(key);

  // Self-invoking so `return` can bail on the first match; try/catch because a
  // throw here would abort parsing and take the page down for a cosmetic fix.
  //
  // Matching is exact on purpose. @supabase/ssr also writes
  // `<key>-code-verifier` during the OAuth handshake, so a "contains
  // -auth-token" test would treat someone who opened the Google consent screen
  // and backed out as signed in, hiding the banner from its own audience.
  // Accepted: the key itself, or the key plus a numeric chunk suffix (`.0`,
  // `.1`, …) as used when a session is too large for one cookie.
  return `(function(){try{
var k=${keyLiteral},c=document.cookie?document.cookie.split("; "):[];
for(var i=0;i<c.length;i++){var e=c[i].indexOf("="),n=e<0?c[i]:c[i].slice(0,e);
if(e<0||!c[i].slice(e+1))continue;
if(n===k||(n.slice(0,k.length+1)===k+"."&&/^[0-9]+$/.test(n.slice(k.length+1)))){
document.documentElement.setAttribute(${JSON.stringify(AUTHED_ATTR)},"1");return;}}
}catch(e){}})();`;
}

// Keeps the flag honest after load: the script runs once, so a sign-out,
// expiry, or sign-in in another tab would leave it stale. Browser-only.
export function setAuthFlag(signedIn: boolean): void {
  const root = document.documentElement;
  if (signedIn) root.setAttribute(AUTHED_ATTR, "1");
  else root.removeAttribute(AUTHED_ATTR);
}
