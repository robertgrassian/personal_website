"use client";

// The interactive half of /video-games/account: the delete control.
//
// Two things have to happen on success and neither is optional. The Server
// Action deletes the auth user and everything that cascades from it, but the
// session cookie is browser state and survives that, so the client must sign
// out too — otherwise the UI keeps believing it is signed in and every
// subsequent request carries a token for a user who no longer exists.
//
// Unlike every other destructive control in the library, this one asks you to
// type something. ConfirmStep's two clicks are calibrated for "remove one game
// from my shelf"; this action destroys the whole library and cannot be undone,
// and at the same trigger styling the two are indistinguishable to the person
// reading them. Typing the username forces a moment of comprehension that a
// second click does not.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAccountAction } from "@/app/video-games/actions";
import { ConfirmStep } from "@/components/video_games/ConfirmStep";
import { useServerAction } from "@/components/video_games/useServerAction";
import { inputClass } from "@/components/video_games/formStyles";
import { createClient } from "@/lib/supabase/client";

type AccountPanelProps = {
  /** Null for a signed-in user who never finished onboarding. They still have
   *  a deletable account, just no library and no handle to type. */
  username: string | null;
  /** True when `username` is null because the library API did not answer,
   *  rather than because there is no profile. Both fall back to typing "delete",
   *  but only this case needs saying out loud: the prompt exists to force a
   *  moment of comprehension, and a phrase that quietly changed to something
   *  easier undermines that unless the reason is on screen. */
  detailsUnavailable?: boolean;
  /** Null when the library API could not be reached. The counts are a nicety;
   *  losing them must not take the delete control down with them. */
  gameCount: number | null;
  wishlistCount: number | null;
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** What the prompt says is about to be destroyed. Counts are dropped rather
 *  than guessed at when the library API did not answer. */
function describeLosses(gameCount: number | null, wishlistCount: number | null): string {
  const parts = ["your profile"];
  parts.push(
    gameCount === null
      ? "your games and their play sessions"
      : `${plural(gameCount, "game")} and their play sessions`
  );
  parts.push(wishlistCount === null ? "your wishlist" : plural(wishlistCount, "wishlist item"));
  parts.push("everyone you follow and everyone who follows you");
  parts.push("your sign-in record");
  return parts.join(", ");
}

export function AccountPanel({
  username,
  detailsUnavailable = false,
  gameCount,
  wishlistCount,
}: AccountPanelProps) {
  const router = useRouter();
  const { isPending, error, run } = useServerAction();
  const [typed, setTyped] = useState("");

  // Someone who never onboarded has no username to type, so the word stands in.
  const phrase = username ?? "delete";
  const matches = typed.trim().toLowerCase() === phrase.toLowerCase();

  function onConfirm() {
    run(deleteAccountAction, {
      onSuccess: async () => {
        // try/finally, because useServerAction invokes onSuccess without
        // awaiting it: a rejected signOut would be an unhandled rejection that
        // silently skipped the navigation, leaving someone on this page with no
        // error and a live session for an account that no longer exists. The
        // account is already gone by here, so navigating away is right whether
        // or not the local sign-out worked.
        try {
          // Clears the cookie and fires an auth state change, which is what
          // resets the pre-paint data-authed flag via AuthButton's subscription.
          await createClient().auth.signOut();
        } finally {
          // replace, not push: this page no longer exists for this visitor, so
          // Back must not return to it.
          router.replace("/video-games");
        }
      },
    });
  }

  return (
    <div className="mt-4">
      <ConfirmStep
        triggerLabel="Delete my account"
        confirmLabel="Delete my account"
        disabled={isPending}
        // Without this the typed text survives a Cancel, so reopening the
        // confirm would show it already filled in and the button already live.
        onCancel={() => setTyped("")}
        prompt={
          <>
            This permanently deletes {describeLosses(gameCount, wishlistCount)}. It cannot be
            undone.
            {detailsUnavailable && (
              <span className="mt-3 block">
                We could not load your account details, so this list has no numbers in it and the
                word below stands in for your username. The deletion itself is unaffected.
              </span>
            )}
            <span className="mt-3 block">
              Type <span className="font-semibold text-shelf-text">{phrase}</span> to confirm.
            </span>
            <input
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={isPending}
              autoComplete="off"
              aria-label={`Type ${phrase} to confirm deletion`}
              className={`${inputClass} mt-2 max-w-xs`}
            />
          </>
        }
        // Gates only the confirm, never Cancel: backing out must always work.
        confirmDisabled={!matches}
        onConfirm={onConfirm}
      />
      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
