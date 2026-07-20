"use client";

// Sign-in page. Two paths, gated by environment:
//   - Production: "Continue with Google" (OAuth, spec decision #14). The only
//     real sign-in method for users.
//   - Local dev: a magic-link form, because the local Supabase stack has no
//     Google provider configured and Mailpit captures the email (spec §7.5).
// process.env.NODE_ENV is inlined by Next at build time, so IS_DEV is a
// constant `false` in prod: the magic-link form is never rendered and there is
// no runtime path to invoke it against prod Supabase. (The component
// definition may still survive tree-shaking into the bundle — the guarantee is
// behavioral, not that the code is stripped.)
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const IS_DEV = process.env.NODE_ENV === "development";

const inputClass =
  "rounded-md border border-divider bg-background px-3 py-2 text-foreground " +
  "placeholder:text-subtle focus:border-link focus:outline-none";
const primaryButtonClass =
  "rounded-md bg-link px-4 py-2 font-medium text-background transition-opacity " +
  "hover:opacity-90 disabled:opacity-50";

function GoogleSignIn() {
  const [pending, setPending] = useState(false);

  async function signInWithGoogle() {
    setPending(true);
    const supabase = createClient();
    // redirectTo must land on our /auth/callback route (which exchanges the
    // code for a session). window.location.origin keeps it correct across
    // localhost, preview, and prod without hardcoding a domain.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    });
    // On success the browser is already navigating to Google; only re-enable
    // the button if kicking off the redirect itself failed.
    if (error) setPending(false);
  }

  return (
    <button
      type="button"
      onClick={signInWithGoogle}
      disabled={pending}
      className={`${primaryButtonClass} w-full`}
    >
      {pending ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

function MagicLinkForm() {
  const [email, setEmail] = useState("");
  // A small state machine beats three booleans: exactly one status at a time.
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      // Local dev signs up brand-new emails on the spot. The MAX_USERS cap is
      // enforced later, at profile creation (spec §6), not here.
      email,
      options: { shouldCreateUser: true },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <p className="mt-3 text-subtle">
        Sent a sign-in link to <span className="text-foreground">{email}</span>. Check Mailpit
        (http://127.0.0.1:54324) to finish signing in.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium text-foreground">
        Dev sign-in (magic link)
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      <button type="submit" disabled={status === "sending"} className={primaryButtonClass}>
        {status === "sending" ? "Sending…" : "Send magic link"}
      </button>
      {status === "error" && (
        // --rating-f carries light/dark values (globals.css) — theme-aware.
        <p className="text-sm" style={{ color: "var(--rating-f)" }}>
          {message}
        </p>
      )}
    </form>
  );
}

function LoginContent() {
  // Both route handlers bounce back here with an ?error flag on failure.
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const errorMessage =
    error === "link_invalid"
      ? "That sign-in link was invalid or expired. Request a new one below."
      : error === "oauth_failed"
        ? "Google sign-in didn't complete. Please try again."
        : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Sign in</h1>
      <p className="mt-2 text-subtle">Sign in to build and manage your game library.</p>

      {errorMessage && (
        <p className="mt-4 rounded-md border border-divider bg-background px-3 py-2 text-sm text-subtle">
          {errorMessage}
        </p>
      )}

      <div className="mt-6">
        <GoogleSignIn />
      </div>

      {/* Dev-only escape hatch; never rendered (and never invocable) in prod. */}
      {IS_DEV && <MagicLinkForm />}
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-16">
      <Suspense fallback={null}>
        <LoginContent />
      </Suspense>
    </main>
  );
}
