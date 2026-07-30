// The "is this viewer signed in?" flag, decided BEFORE first paint.
//
// The library pages must render HTML that is identical for every viewer, so
// auth-dependent controls used to resolve after hydration — which paints one
// frame of the wrong state (the sign-up banner flashing at signed-in viewers,
// "Sign in"/"Sign out" popping in late).
//
// Same constraint, two different reasons: /video-games is prerendered static,
// so per-viewer markup is impossible. /video-games/u/[username] is dynamic but reads no
// session, which is what keeps its response cacheable under libraryCacheTag.
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
//
// Not a single source of truth despite looking like one: globals.css hardcodes
// this, and data-hide-authed/data-hide-anon are literals there and in
// AuthButton/SignupCta. CSS cannot import a TS constant, so a rename type-checks
// and builds clean while silently disabling the mechanism. Grep, don't rename.
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

  // The key can only hold [a-z0-9-] today; escaping costs a line and removes the
  // need to re-check that if the derivation ever widens.
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Every piece is load-bearing:
  //   (?:^|;\s*)  name boundary, so `xsb-…` cannot match. \s* rather than a
  //               literal "; " because engines all emit that but the spec does
  //               not require it.
  //   (?:\.\d+)?  the chunk suffix used when a session exceeds one cookie.
  //   =[^;]       non-empty value, so a cleared `key=` is not a session.
  // The boundary and the `=` together are what reject `<key>-code-verifier`,
  // which @supabase/ssr writes mid-OAuth: without them, someone who opened the
  // consent screen and backed out would read as signed in, hiding the banner
  // from exactly the visitor it exists for.
  const pattern = `(?:^|;\\s*)${escapedKey}(?:\\.\\d+)?=[^;]`;

  // try/catch: a throw here would abort parsing and take the page down.
  return `(function(){try{if(new RegExp(${JSON.stringify(pattern)}).test(document.cookie))\
document.documentElement.setAttribute(${JSON.stringify(AUTHED_ATTR)},"1");}catch(e){}})();`;
}

// Keeps the flag honest after load: the script runs once, so a sign-out,
// expiry, or sign-in in another tab would leave it stale. Browser-only.
export function setAuthFlag(signedIn: boolean): void {
  const root = document.documentElement;
  if (signedIn) root.setAttribute(AUTHED_ATTR, "1");
  else root.removeAttribute(AUTHED_ATTR);
}
