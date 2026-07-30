"use client";

// Per-viewer controls in the library header: a Follow / Following toggle, and a
// way back to your own library once a follower list has taken you somewhere
// else. Both depend on who is looking, so both resolve after hydration (see
// useViewerRelationship) and neither appears in the cached HTML.
//
// They live in one component because they need the same answer. Splitting them
// would mean two components each asking the API the same question on mount.

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckIcon } from "@/components/Icon";
import { followUserAction, unfollowUserAction } from "@/app/video-games/actions";
import { useViewerRelationship } from "./useViewerRelationship";

type FollowControlsProps = {
  // The library being viewed. Its owner is who gets followed.
  ownerUsername: string;
};

export function FollowControls({ ownerUsername }: FollowControlsProps) {
  const [relationship, setRelationship] = useViewerRelationship(ownerUsername);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // "unknown" covers both signed-out and not-yet-resolved; "me" is your own
  // library. Neither gets controls, and rendering nothing until the answer
  // arrives is what stops a Follow button flashing on your own page.
  if (relationship === "unknown" || relationship === "me") return null;

  const isFollowing = relationship === "following";

  function toggle() {
    const next = isFollowing ? "not-following" : "following";
    const previous = relationship;
    startTransition(async () => {
      setError(null);
      // Flip first so the button responds immediately. useOptimistic is not
      // usable here: it converges by falling back to a prop, and this state has
      // no prop to fall back to — it was fetched, not passed in. So the revert
      // below is manual.
      setRelationship(next);
      const result = isFollowing
        ? await unfollowUserAction(ownerUsername)
        : await followUserAction(ownerUsername);
      if (!result.ok) {
        setRelationship(previous);
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <Link
          href="/library"
          className="text-sm whitespace-nowrap text-shelf-text-muted hover:text-shelf-text underline underline-offset-4 transition-colors duration-150"
        >
          Back to my library
        </Link>
        <button
          type="button"
          onClick={toggle}
          disabled={isPending}
          // Two visual states: following is a quiet outline (it is a state, not
          // a call to action), not-following is the site's amber accent paired
          // with text-background, the same pairing the sign-up CTA uses so it
          // reads correctly in light and dark.
          className={
            isFollowing
              ? "flex items-center gap-1.5 rounded-md border border-shelf-plank px-3 py-1.5 text-sm font-medium text-shelf-text-muted transition-colors hover:border-link hover:text-link cursor-pointer disabled:opacity-60"
              : "rounded-md bg-link px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-60"
          }
        >
          {isFollowing ? (
            <>
              <CheckIcon className="w-4 h-4" aria-hidden />
              <span>Following</span>
            </>
          ) : (
            "Follow"
          )}
        </button>
      </div>
      {/* role="status" so the failure is announced rather than only seen. */}
      {error && (
        <p role="status" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
