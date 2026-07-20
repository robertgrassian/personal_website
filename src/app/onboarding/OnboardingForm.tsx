"use client";

// The username picker. A Client Component so it can use useActionState for
// pending state and inline error display, but the actual work happens in the
// Server Action it's bound to (./actions.ts) — the client never sees the API
// token.
import { useActionState } from "react";
import { submitOnboarding, type OnboardingState } from "./actions";

export function OnboardingForm({ suggestedUsername }: { suggestedUsername: string }) {
  // useActionState (React 19): given (action, initialState) it returns the
  // latest state, a form-ready action wrapper, and a pending flag. On submit
  // React calls the server action, then re-renders with whatever it returns.
  const [state, formAction, isPending] = useActionState<OnboardingState, FormData>(
    submitOnboarding,
    null
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-sm font-medium text-foreground">
          Username
        </label>
        <input
          id="username"
          name="username"
          required
          minLength={3}
          maxLength={30}
          defaultValue={suggestedUsername}
          autoComplete="off"
          // Client-side hint mirroring the server CHECK; the server is still
          // the source of truth (it re-validates and owns the reserved list).
          pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]{2,29}"
          className="rounded-md border border-divider bg-background px-3 py-2 text-foreground placeholder:text-subtle focus:border-link focus:outline-none"
        />
        <p className="text-xs text-subtle">
          3–30 characters: letters, numbers, hyphens, underscores. This becomes your library&apos;s
          URL.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-sm font-medium text-foreground">
          Display name <span className="text-subtle">(optional)</span>
        </label>
        <input
          id="displayName"
          name="displayName"
          maxLength={80}
          placeholder="Defaults to your username"
          className="rounded-md border border-divider bg-background px-3 py-2 text-foreground placeholder:text-subtle focus:border-link focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-link px-4 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create my library"}
      </button>

      {/* --rating-f carries light/dark values (globals.css) — theme-aware. */}
      {state?.error && (
        <p className="text-sm" style={{ color: "var(--rating-f)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
