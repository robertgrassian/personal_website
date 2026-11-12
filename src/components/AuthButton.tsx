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
// The flag is kept current by AuthFlagSync, not here: this control lives in a menu that unmounts
// it when closed, so it cannot hold a subscription.
import { usePathname, useRouter } from "next/navigation";
import { signInPath } from "@/lib/nextPath";
import { createClient } from "@/lib/supabase/client";
// Shared with the other rows of the header menu, so the list stays one look.
import { MenuItem } from "@/components/ui/MenuItem";

export function AuthButton() {
  const router = useRouter();
  // Path only, no query string: useSearchParams would need a Suspense
  // boundary, and would drop this control out of a static page's HTML.
  const pathname = usePathname();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // data-authed needs no manual clearing: signOut fires an auth state change,
    // and AuthFlagSync swaps the page back to its signed-out half.
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
