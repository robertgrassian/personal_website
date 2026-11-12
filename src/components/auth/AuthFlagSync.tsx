"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { setAuthFlag } from "@/lib/authFlag";
import { forgetOwnedLibrary, forgetOwnedLibraryForOtherUser } from "@/lib/ownedLibrary";

// Keeps the pre-paint data-authed flag (src/lib/authFlag.ts) true to the session after load. The
// inline script runs once, so a sign-out, an expiry, or a sign-in in another tab would otherwise
// leave every data-hide-authed / data-hide-anon element showing the wrong half.
//
// Renders nothing, and must be mounted somewhere that never unmounts. It used to live inside
// AuthButton, which sits in a menu that renders its children only while open: choosing Sign out
// closed the menu, unmounted the subscription, and the sign-out event that should have cleared
// the flag arrived with nobody listening. Any page using the markers mounts this once.
export function AuthFlagSync() {
  useEffect(() => {
    const supabase = createClient();
    // INITIAL_SESSION fires on mount with the current cookie session, so this both corrects the
    // script's guess and tracks changes after.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthFlag(Boolean(session));
      // The cached "this library is mine" answer (src/lib/ownedLibrary.ts) belongs to the session
      // that earned it. A switch of account fires SIGNED_IN, never a sign-out, so checking only
      // for absence would let one user's entry survive into the next user's page.
      if (session) forgetOwnedLibraryForOtherUser(session.user.id);
      else forgetOwnedLibrary();
    });
    return () => subscription.unsubscribe();
  }, []);

  return null;
}
