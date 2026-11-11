"use client";

// Sign-in / sign-out control, mounted by each app page that has accounts
// rather than in the global nav: the portfolio (/, /about, /resume) is static
// content with nothing to sign into. The session itself is site-wide (one
// cookie on the domain, middleware refresh, /auth/* handlers, /sign-in), so
// nothing here may assume which app is hosting it. Sign-in returns the visitor
// to the page they were on.
//
// This reflects the session for DISPLAY only. It is never a security boundary
// — every protected read/write is authorized server-side by FastAPI verifying
// the JWT. A spoofed client state here changes nothing real.
//
// Both controls always render and CSS drops the one that does not apply, driven
// by the pre-paint data-authed flag (src/lib/authFlag.ts). This replaced a
// render-nothing-until-known guard, which was correct but popped in a beat after
// paint, since onAuthStateChange cannot fire before hydration.
//
// This component also maintains that flag for the page, which is why it still
// subscribes despite no longer rendering from session state. Anything else on
// the page marked data-hide-authed/data-hide-anon (SignupCta, the Account menu
// row) relies on this subscription, so a page using those markers should mount
// this too. In the library it sits in LibraryHeaderMenu's always-mounted slot,
// so a collapsed menu does not unsubscribe it.
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signInPath } from "@/lib/nextPath";
import { createClient } from "@/lib/supabase/client";
import { setAuthFlag } from "@/lib/authFlag";
import { forgetOwnedLibrary, forgetOwnedLibraryForOtherUser } from "@/lib/ownedLibrary";
// Shared with the other rows of the header menu, so the list stays one look.
import { MenuItem } from "@/components/ui/MenuItem";

export function AuthButton() {
  const router = useRouter();
  // Path only, no query string: useSearchParams would need a Suspense
  // boundary, and would drop this control out of a static page's HTML.
  const pathname = usePathname();

  // Keeps the pre-paint flag honest: the inline script runs once, so a sign-out,
  // an expiry, or a sign-in in another tab would otherwise leave it stale.
  useEffect(() => {
    const supabase = createClient();
    // INITIAL_SESSION fires on mount with the current cookie session, so this
    // both corrects the script's guess and tracks changes after.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthFlag(Boolean(session));
      // Same staleness problem, one level up: the cached "this library is
      // mine" answer (src/lib/ownedLibrary.ts) belongs to the session that
      // earned it. Losing the session drops it, and so does replacing it with
      // another account's — a switch fires SIGNED_IN, never a sign-out, so
      // checking only for absence would let one user's entry survive into the
      // next user's page. Signing in does not seed it: only /me/relationship
      // can say whose library this is.
      if (session) forgetOwnedLibraryForOtherUser(session.user.id);
      else forgetOwnedLibrary();
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // data-authed needs no manual clearing: signOut fires an auth state change,
    // and the subscription above swaps this back to "Sign in".
    //
    // Refresh Server Components so server-rendered auth-dependent UI
    // re-evaluates with the now-absent session.
    router.refresh();
  }

  // A fragment so both controls sit directly in the menu's column, with no
  // wrapper box. Only one is ever displayed, so spacing is unaffected.
  return (
    <>
      <MenuItem href={signInPath(pathname)} data-hide-authed="">
        Sign in
      </MenuItem>
      <MenuItem onClick={signOut} data-hide-anon="">
        Sign out
      </MenuItem>
    </>
  );
}
