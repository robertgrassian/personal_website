"use client";

// The interactive half of /video-games/account: the delete control.
//
// Two things have to happen on success and neither is optional. The Server
// Action deletes the auth user and everything that cascades from it, but the
// session cookie is browser state and survives that, so the client must sign
// out too — otherwise the UI keeps believing it is signed in and every
// subsequent request carries a token for a user who no longer exists.
import { useRouter } from "next/navigation";
import { deleteAccountAction } from "@/app/video-games/actions";
import { ConfirmStep } from "@/components/video_games/ConfirmStep";
import { useServerAction } from "@/components/video_games/useServerAction";
import { createClient } from "@/lib/supabase/client";

type AccountPanelProps = {
  gameCount: number;
  wishlistCount: number;
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function AccountPanel({ gameCount, wishlistCount }: AccountPanelProps) {
  const router = useRouter();
  const { isPending, error, run } = useServerAction();

  function onConfirm() {
    run(deleteAccountAction, {
      onSuccess: async () => {
        // signOut clears the cookie and fires an auth state change, which is
        // what resets the pre-paint data-authed flag via AuthButton's
        // subscription. Awaited before navigating so the destination renders
        // signed out on its first paint rather than flipping a beat later.
        await createClient().auth.signOut();
        // replace, not push: the account page no longer exists for this
        // visitor, so Back must not return to it.
        router.replace("/video-games");
      },
    });
  }

  return (
    <div className="mt-4">
      <ConfirmStep
        triggerLabel="Delete my account"
        confirmLabel="Delete my account"
        disabled={isPending}
        prompt={
          <>
            This permanently deletes your profile, {plural(gameCount, "game")} and their play
            sessions, {plural(wishlistCount, "wishlist item")}, everyone you follow, and your
            sign-in record. It cannot be undone.
          </>
        }
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
