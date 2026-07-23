"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LIBRARY_OWNER_USERNAME } from "@/lib/games";

// Resolves "is the current viewer the owner of this library?" client-side,
// after hydration. This is deliberate: the page itself is static and its
// cached HTML must be identical for every viewer, so per-viewer state can
// never be server-rendered into it. The cost is a brief window where edit
// controls haven't appeared yet on your own page.
//
// Logged-out viewers (the overwhelmingly common case) pay no network cost:
// getSession() reads local cookies, and without a session we stop there.
export function useIsLibraryOwner(): boolean {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    // Guards against a state update landing after unmount (e.g. the viewer
    // navigated away while /me/profile was in flight).
    let cancelled = false;

    async function resolve() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      // Relative URL: the /api/py rewrite proxies to FastAPI in both dev and
      // prod, so this is a same-origin request — no CORS involved.
      const res = await fetch("/api/py/me/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) return; // 404 = not onboarded; anything else = not owner

      const profile = (await res.json()) as { username?: string };
      if (!cancelled && profile.username?.toLowerCase() === LIBRARY_OWNER_USERNAME) {
        setIsOwner(true);
      }
    }

    resolve().catch(() => {}); // any failure just means no edit controls

    return () => {
      cancelled = true;
    };
  }, []);

  return isOwner;
}
