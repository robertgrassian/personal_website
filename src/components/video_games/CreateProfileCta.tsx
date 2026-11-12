"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { API_PREFIX } from "@/lib/apiPrefix";
import { isKnownLibraryOwner } from "@/lib/ownedLibrary";
import { buttonClasses } from "@/components/ui/buttonStyles";

// SignupCta's counterpart for a visitor who is signed in but has no game
// library profile. Signing in never creates one, so this is how they ask for it.
//
// The page HTML is identical for every viewer and the pre-paint flag only
// proves a session exists, so whether this viewer has a profile is answered
// here, after hydration, by GET /me/profile. Only a 404 ("no profile") shows
// the banner; a 200, an error or a timeout all leave it hidden, since showing
// it to someone who already has a library is the worse mistake.
export function CreateProfileCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 10_000);

    async function resolve() {
      const {
        data: { session },
      } = await createClient().auth.getSession();
      // No session: SignupCta covers this visitor, and no request is made.
      if (!session) return;
      // A library this browser already saw them own; nothing to offer.
      if (isKnownLibraryOwner(session.user.id)) return;

      const res = await fetch(`${API_PREFIX}/me/profile`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
        signal: abort.signal,
      });
      if (!cancelled && res.status === 404) setShow(true);
    }

    // Any failure means no banner.
    resolve().catch(() => {});

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      abort.abort();
    };
  }, []);

  if (!show) return null;

  return (
    <aside
      // Dropped by CSS if the session goes away while the banner is up
      // (AuthFlagSync keeps the flag current).
      data-hide-anon=""
      // Same shelf-token surface as SignupCta, so the two read as one slot.
      className="mt-6 rounded-lg border border-shelf-input-border bg-shelf-input px-5 py-4 sm:px-6 sm:py-5"
    >
      <p className="max-w-2xl text-sm leading-relaxed text-shelf-text-muted sm:text-base">
        You are signed in but have no game library yet. Make one to track your own games.
      </p>
      <div className="mt-4">
        <Link href="/onboarding" className={`${buttonClasses("primary", "md")} text-sm`}>
          Create a profile
        </Link>
      </div>
    </aside>
  );
}
