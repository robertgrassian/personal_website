"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { forgetOwnedLibrary, isKnownOwnLibrary, rememberOwnedLibrary } from "@/lib/ownedLibrary";

// Resolves the viewer's relationship to the library they're looking at, so the
// follow button and the "back to my library" link know what to render.
//
// The page HTML is identical for every viewer (one route is prerendered static,
// the other cached), so this can only be answered client-side after hydration.
// Its `isMe` result also decides whether edit affordances render, via
// FollowControls' useIsOwner — one request, one answer, so the Follow button and
// the edit pencils can never contradict each other. It cannot use the
// pre-paint data-authed flag either — that proves a session exists, not whose,
// and "am I following this person?" is a question only the API can answer.
//
// Four states rather than a boolean, because "don't know yet" and "this is my
// own library" both mean "render nothing" and neither is expressible as
// following/not-following. Starting at "unknown" is what keeps a Follow button
// from flashing on your own page.
export type ViewerRelationship = "unknown" | "me" | "following" | "not-following";

// The setter takes the username the caller believes it is writing about, and
// drops the update if the viewer has since navigated to a different library.
// Necessary because the follow button's optimistic revert fires after an
// awaited request: click Follow on A, click through to B, then A's write fails
// — an unguarded revert would write A's answer into B's page, showing
// "Following" for someone you have never followed and offering to unfollow
// them. Same hazard the effect's reset below guards on the read side.
export type SetViewerRelationship = (forUsername: string, next: ViewerRelationship) => void;

export function useViewerRelationship(
  ownerUsername: string
): [ViewerRelationship, SetViewerRelationship] {
  const [relationship, setRelationship] = useState<ViewerRelationship>("unknown");

  // A ref, not the prop: the setter is handed to callers that captured it in an
  // async closure, so it has to read the CURRENT owner, not the one that was
  // current when the closure was made.
  const ownerRef = useRef(ownerUsername);
  ownerRef.current = ownerUsername;

  const setForOwner = useCallback<SetViewerRelationship>((forUsername, next) => {
    if (forUsername === ownerRef.current) setRelationship(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Reset before resolving. Load-bearing, not defensive: navigating from one
    // /video-games/u/[username] page to another
    // reconciles this component rather than remounting it. Without the reset a
    // "following" answer would persist onto the next person's library, showing
    // "Following" for someone you have never followed — and the unfollow it
    // offered would target the wrong user.
    setRelationship("unknown");

    // Then re-answer "me" immediately if a previous visit confirmed this is the
    // viewer's own library (src/lib/ownedLibrary.ts). The edit affordances read
    // this through useIsOwner, so on a warm cache they render at hydration
    // instead of one round trip later.
    //
    // Safe in the direction it guesses: "me" is the state that renders NO
    // follow button, so a wrong guess shows the owner's pencils to someone who
    // cannot use them (every write re-checks ownership server-side) rather than
    // offering to follow the wrong person. The fetch below corrects it either
    // way.
    const guessedOwn = isKnownOwnLibrary(ownerUsername);
    if (guessedOwn) setRelationship("me");

    // Every path that fails to confirm the guess has to take it back, or a
    // stale cache leaves edit controls on a page the viewer does not own.
    // Keeps the entry: only a missing session or an authoritative "not you"
    // clears it, so one flaky request does not cost the next visit its head
    // start.
    function dropGuess() {
      if (guessedOwn && !cancelled) setRelationship("unknown");
    }

    async function resolve() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      // Logged-out viewers pay no network cost, and stay at "unknown" so
      // nothing renders. getSession() only reads local cookies.
      if (!session) {
        // Undo the optimistic guess above: the cache outlived its session.
        forgetOwnedLibrary();
        if (!cancelled) setRelationship("unknown");
        return;
      }

      // Relative URL: the /api/py rewrite makes this same-origin in dev and
      // prod alike, so no CORS is involved.
      const res = await fetch(`/api/py/me/relationship/${encodeURIComponent(ownerUsername)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        dropGuess();
        return;
      }
      if (cancelled) return;

      const body = (await res.json()) as { amIFollowing?: boolean; isMe?: boolean };
      if (cancelled) return;
      if (body.isMe) {
        rememberOwnedLibrary(ownerUsername);
        setRelationship("me");
      } else {
        // Only clears an entry naming THIS library, so signing in as someone
        // else and browsing to a third party's page cannot wipe the viewer's
        // own cached answer.
        if (isKnownOwnLibrary(ownerUsername)) forgetOwnedLibrary();
        setRelationship(body.amIFollowing ? "following" : "not-following");
      }
    }

    // Any failure just means no follow controls, and no edit ones either.
    resolve().catch(dropGuess);

    return () => {
      cancelled = true;
    };
  }, [ownerUsername]);

  return [relationship, setForOwner];
}
