"use client";

// Per-viewer library controls: a Follow / Following toggle beside the heading,
// and a way back to your own library, in the header menu, once a follower list
// has taken you somewhere else. Both depend on who is looking, so both resolve
// after hydration (see useViewerRelationship) and neither appears in the cached
// HTML.
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
import { useDebugMode } from "@/lib/debugMode";
import { useServerAction } from "./useServerAction";
import { headerMenuItemClass } from "./formStyles";
import { followUserAction, unfollowUserAction } from "@/app/video-games/actions";
import {
  useViewerRelationship,
  type SetViewerRelationship,
  type ViewerRelationship,
} from "./useViewerRelationship";

type FollowState = {
  ownerUsername: string;
  relationship: ViewerRelationship;
  confirmed: boolean;
  setRelationship: SetViewerRelationship;
};

// null default = "no provider above me", which both controls treat as "render
// nothing" rather than crashing.
const FollowStateContext = createContext<FollowState | null>(null);

export function FollowStateProvider({
  ownerUsername,
  allowDebug = false,
  children,
}: {
  ownerUsername: string;
  // Whether ?debug may pretend the viewer is the owner. Decided by the server
  // (see LibraryPage) because process.env.VERCEL is not inlined into client
  // bundles, so checking it here would enable this on a deploy.
  allowDebug?: boolean;
  children: ReactNode;
}) {
  const { relationship, confirmed, setRelationship } = useViewerRelationship(ownerUsername);
  // Overridden here rather than in the two hooks below, because everything that
  // asks reads this one context: the answer cannot end up different in two
  // places. Reads and writes still go out unauthenticated and will fail, so this
  // buys the LAYOUT of the owner-only UI and nothing else.
  const debugOwner = useDebugMode(allowDebug);
  const value = debugOwner
    ? { ownerUsername, relationship: "me" as const, confirmed: true, setRelationship }
    : { ownerUsername, relationship, confirmed, setRelationship };

  return <FollowStateContext.Provider value={value}>{children}</FollowStateContext.Provider>;
}

// "Is the viewer looking at their own library?" — the question that decides
// whether edit affordances (pencils, "Add game") render.
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
//
// TWO ANSWERS, and picking the wrong one is the sharp edge here. The library
// caches "this one is mine" (src/lib/ownedLibrary.ts) and useViewerRelationship
// seeds itself from it, so between hydration and the /me/relationship response
// there is a window where the answer is a guess that may be retracted.
//
// The dividing line is what the server can still refuse. PATCH and DELETE
// /me/games/{id} 404 on a row the caller does not own, so an affordance that
// targets an EXISTING row is safe on the guess and gets it instantly. POST
// /me/games has no row to check and always writes to the caller's own library,
// so an affordance that CREATES one must wait for the confirmed answer or it
// can put a row somewhere the viewer was not looking.
//
// Hence the names: reach for useIsConfirmedOwner unless you know the guess is
// safe for what you are gating.

// The API said so. The slower, always-correct answer — use it for anything
// that creates a row, and by default when unsure.
export function useIsConfirmedOwner(): boolean {
  const state = useContext(FollowStateContext);
  return state?.relationship === "me" && state.confirmed;
}

// The API said so, OR a previous visit did and this one has not heard back
// yet. Instant, and wrong for a few hundred milliseconds if the cache is
// stale. Fine for pencils, copy, and anything else the server can still
// refuse; never for a create.
export function useIsLikelyOwner(): boolean {
  return useContext(FollowStateContext)?.relationship === "me";
}

// Whose library is on screen, for the reads that name it. Not an ownership
// question, so it answers for every viewer; "" only without a provider.
export function useLibraryOwnerUsername(): string {
  return useContext(FollowStateContext)?.ownerUsername ?? "";
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
  //
  // The shared class rather than the copy that used to live here: this is a row
  // of the header menu like Account and Sign out, and the two drifted once.
  return (
    <Link href="/library" className={headerMenuItemClass}>
      Back to my library
    </Link>
  );
}
