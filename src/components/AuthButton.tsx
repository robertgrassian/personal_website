"use client";

// Sign-in / sign-out control for the game library header.
//
// It lives in the library rather than the global nav on purpose: the portfolio
// (/, /about, /resume) is static content with no accounts, and the game
// library is the only app here with sign-in. The auth *infrastructure* stays
// site-wide (one session cookie on the domain, middleware refresh, /auth/*
// handlers) so a future app can share the session — only the surfaces moved.
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
// subscribes despite no longer rendering from session state. SignupCta reads the
// same flag and has no subscription of its own; both are rendered by LibraryPage,
// so it is always mounted alongside. That the subscription now lives inside a
// collapsed menu changes nothing: LibraryHeaderMenu renders its children only
// when open, but this pair sits in the header's always-mounted slot.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { setAuthFlag } from "@/lib/authFlag";
import { forgetOwnedLibrary, forgetOwnedLibraryForOtherUser } from "@/lib/ownedLibrary";
// Shared with the other rows of the header menu, so the list stays one look.
import { headerMenuItemClass } from "@/components/video_games/formStyles";

export function AuthButton() {
  const router = useRouter();

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
      <Link href="/video-games/start" className={headerMenuItemClass} data-hide-authed="">
        Sign in
      </Link>
      <button type="button" onClick={signOut} className={headerMenuItemClass} data-hide-anon="">
        Sign out
      </button>
    </>
  );
}
