"use client";

import { useState, useTransition } from "react";
import type { MutateResult } from "@/lib/meApi";

// The "call a Server Action from a modal" pattern, which every owner write in
// this directory repeats: clear the last error, await the action inside a
// transition, and surface `result.message` if it failed.
//
// `useTransition` (a React hook, not a Next one) is what makes `isPending` span
// the WHOLE round trip rather than just the fetch. A Server Action's response
// carries the re-rendered server tree, so the transition stays pending until
// revalidated data has landed and painted. That is why buttons disabled on
// `isPending` stay disabled until the shelves visibly update, instead of
// re-enabling a beat early while the old data is still on screen.
//
// `onSuccess` covers the common case (usually `onClose`) so no caller writes
// the `if (result.ok)` itself. `onError` exists for the one caller that must do
// more than display a message: FollowControls flips its button before the write
// and has to put it back when the write is refused. The error is still set
// either way, so an `onError` handler only adds to the default behavior.
//
// `run` returns void rather than the result, deliberately. The work happens
// inside a transition that outlives the call, so anything handed back would be
// a promise callers would have to remember not to ignore — the callbacks put
// the follow-up work where it actually runs.
export type ServerActionState = {
  isPending: boolean;
  error: string | null;
  /** Exposed for the rare caller that sets an error without running an action
   *  (a client-side validation refusal), and to clear one on demand. */
  setError: (message: string | null) => void;
  run: (
    action: () => Promise<MutateResult>,
    options?: {
      onSuccess?: () => void;
      onError?: (message: string) => void;
      /** Runs inside the transition, before the await. Optimistic updates must
       *  go here: React ties an optimistic value's lifetime to the transition
       *  it was set in, so setting it outside would revert it immediately. */
      optimistic?: () => void;
    }
  ) => void;
};

export function useServerAction(): ServerActionState {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run: ServerActionState["run"] = (action, options) => {
    startTransition(async () => {
      setError(null);
      options?.optimistic?.();
      const result = await action();
      if (result.ok) {
        options?.onSuccess?.();
      } else {
        setError(result.message);
        options?.onError?.(result.message);
      }
    });
  };

  return { isPending, error, setError, run };
}
