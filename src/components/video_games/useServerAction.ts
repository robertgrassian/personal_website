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
// `run` returns void rather than the result: the work happens inside a
// transition that outlives the call, so anything handed back would be a promise
// callers had to remember not to ignore. Follow-up work goes in the callbacks
// below, which run where the work actually finishes.
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
      // try/catch, because `action()` is a network call disguised as a function
      // call: a Server Action that throws on the server (or never answers)
      // arrives here as a rejected promise, not as `{ ok: false }`. Without
      // this, that rejection escaped the transition and NOTHING happened: no
      // error line, no onSuccess, no visible trace. Every mutating dialog in
      // this directory runs through this hook, so that was one shared way for
      // any owner write to look like a dead button.
      //
      // The message is deliberately non-committal about whether the change
      // landed: a rejection here covers both "never reached the server" and
      // "server did the work, then the response was lost".
      let result: MutateResult;
      try {
        result = await action();
      } catch {
        // The thrown value is not shown: in production Next replaces Server
        // Action errors with an opaque digest, so surfacing it would put a
        // random id in front of the viewer instead of an instruction.
        const message = "Something went wrong, and the change may not have been saved. Refresh.";
        setError(message);
        options?.onError?.(message);
        return;
      }

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
