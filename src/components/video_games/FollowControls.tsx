"use client";

// Per-viewer library controls: a Follow / Following toggle beside the heading,
// and a way back to your own library once a follower list has taken you
// somewhere else. Both depend on who is looking, so both resolve after
// hydration (see useViewerRelationship) and neither appears in the cached HTML.
//
// They sit in different corners of the header but need the SAME answer, so the
// fetch lives in a provider and each control reads it from context rather than
// asking the API the same question twice. React convention, not a Next one:
// context is the standard way to share state between components that are not
// in a parent/child line.
//
// The provider can wrap server-rendered markup (the <h1>, the counts). A client
// component may receive server components as `children` — they render on the
// server and arrive as an already-rendered tree, so wrapping the header in this
// does not turn the heading into client-side JavaScript.

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { CheckIcon } from "@/components/Icon";
import { useServerAction } from "./useServerAction";
import { followUserAction, unfollowUserAction } from "@/app/video-games/actions";
import {
  useViewerRelationship,
  type SetViewerRelationship,
  type ViewerRelationship,
} from "./useViewerRelationship";

type FollowState = {
  ownerUsername: string;
  relationship: ViewerRelationship;
  setRelationship: SetViewerRelationship;
};

// null default = "no provider above me", which both controls treat as "render
// nothing" rather than crashing.
const FollowStateContext = createContext<FollowState | null>(null);

export function FollowStateProvider({
  ownerUsername,
  children,
}: {
  ownerUsername: string;
  children: ReactNode;
}) {
  const [relationship, setRelationship] = useViewerRelationship(ownerUsername);
  return (
    <FollowStateContext.Provider value={{ ownerUsername, relationship, setRelationship }}>
      {children}
    </FollowStateContext.Provider>
  );
}

// "Is the viewer looking at their own library?" — the question that decides
// whether edit affordances (pencils, "Add game", the Unrated shelf) render.
//
// Reads `isMe` off the relationship response rather than asking a second
// endpoint: /me/relationship/{owner} carries it precisely so one request settles
// both "hide the Follow button" and "show edit controls" (schemas/me.py
// documents it as such). Resolve them from anything else and the two can
// disagree while one request is still in flight.
//
// Any failure (403 not onboarded, 404 unknown username, network) leaves
// `relationship` at "unknown", so this returns false: no edit controls, which
// is the safe direction.
export function useIsOwner(): boolean {
  return useContext(FollowStateContext)?.relationship === "me";
}

// "unknown" covers both signed-out and not-yet-resolved; "me" is your own
// library. Neither gets controls, and rendering nothing until the answer
// arrives is what stops a Follow button flashing on your own page.
function useResolvedFollowState(): FollowState | null {
  const state = useContext(FollowStateContext);
  if (!state || state.relationship === "unknown" || state.relationship === "me") return null;
  return state;
}

export function FollowButton() {
  const state = useResolvedFollowState();
  const { isPending, error, run } = useServerAction();

  if (!state) return null;
  const { ownerUsername, relationship, setRelationship } = state;
  const isFollowing = relationship === "following";

  function toggle() {
    const next = isFollowing ? "not-following" : "following";
    run(() => (isFollowing ? unfollowUserAction(ownerUsername) : followUserAction(ownerUsername)), {
      // Flip first so the button responds immediately. useOptimistic is not
      // usable here: it converges by falling back to a prop, and this state
      // has no prop to fall back to — it was fetched, not passed in. So the
      // revert in onError is manual.
      //
      // Both writes name the user they are about, so neither lands if the
      // viewer has navigated to a different library while the request was in
      // flight (see SetViewerRelationship).
      optimistic: () => setRelationship(ownerUsername, next),
      onError: () => setRelationship(ownerUsername, relationship),
    });
  }

  return (
    // relative + an absolutely positioned error: a failure must not reflow the
    // heading row and push the handle and counts down.
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        // Two visual states: following is a quiet outline (it is a state, not a
        // call to action), not-following is the site's amber accent paired with
        // text-background, the same pairing the sign-up CTA uses so it reads
        // correctly in light and dark.
        className={
          isFollowing
            ? "flex items-center gap-1 rounded-md border border-shelf-plank px-2.5 py-1 text-xs font-medium text-shelf-text-muted transition-colors hover:border-link hover:text-link cursor-pointer disabled:opacity-60"
            : "rounded-md bg-link px-2.5 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-60"
        }
      >
        {isFollowing ? (
          <>
            <CheckIcon className="w-3.5 h-3.5" aria-hidden />
            <span>Following</span>
          </>
        ) : (
          "Follow"
        )}
      </button>
      {/* role="status" so the failure is announced rather than only seen. */}
      {error && (
        <span
          role="status"
          className="absolute top-full left-0 mt-1 w-max max-w-60 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </span>
      )}
    </span>
  );
}

export function BackToMyLibrary() {
  const state = useResolvedFollowState();
  if (!state) return null;

  // /library is already a force-dynamic resolver that redirects a signed-in
  // viewer to their own shelf, so this needs no username of its own.
  return (
    <Link
      href="/library"
      className="text-sm whitespace-nowrap text-shelf-text-muted hover:text-link underline underline-offset-4 transition-colors duration-150"
    >
      Back to my library
    </Link>
  );
}
