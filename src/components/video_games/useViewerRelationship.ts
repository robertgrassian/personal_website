"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Resolves the viewer's relationship to the library they're looking at, so the
// follow button and the "back to my library" link know what to render.
//
// Same constraint and same shape as useIsLibraryOwner: the page HTML is
// identical for every viewer (one is prerendered static, the other cached), so
// this can only be answered client-side after hydration. It cannot use the
// pre-paint data-authed flag either — that proves a session exists, not whose,
// and "am I following this person?" is a question only the API can answer.
//
// Four states rather than a boolean, because "don't know yet" and "this is my
// own library" both mean "render nothing" and neither is expressible as
// following/not-following. Starting at "unknown" is what keeps a Follow button
// from flashing on your own page.
export type ViewerRelationship = "unknown" | "me" | "following" | "not-following";

export function useViewerRelationship(
  ownerUsername: string
): [ViewerRelationship, (next: ViewerRelationship) => void] {
  const [relationship, setRelationship] = useState<ViewerRelationship>("unknown");

  useEffect(() => {
    let cancelled = false;

    // Reset before resolving, exactly as in useIsLibraryOwner and for the same
    // reason: navigating from one /video-games/u/[username] page to another
    // reconciles this component rather than remounting it. Without the reset a
    // "following" answer would persist onto the next person's library, showing
    // "Following" for someone you have never followed — and the unfollow it
    // offered would target the wrong user.
    setRelationship("unknown");

    async function resolve() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      // Logged-out viewers pay no network cost, and stay at "unknown" so
      // nothing renders. getSession() only reads local cookies.
      if (!session) return;

      // Relative URL: the /api/py rewrite makes this same-origin in dev and
      // prod alike, so no CORS is involved.
      const res = await fetch(`/api/py/me/relationship/${encodeURIComponent(ownerUsername)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok || cancelled) return;

      const body = (await res.json()) as { amIFollowing?: boolean; isMe?: boolean };
      if (cancelled) return;
      if (body.isMe) setRelationship("me");
      else setRelationship(body.amIFollowing ? "following" : "not-following");
    }

    resolve().catch(() => {}); // any failure just means no follow controls

    return () => {
      cancelled = true;
    };
  }, [ownerUsername]);

  return [relationship, setRelationship];
}
