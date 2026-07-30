"use client";

// The sign-in half of the landing page (page.tsx renders the prose above it).
// Split out as its own client component for two reasons: the parent stays a
// server component so it can export `metadata` (client components cannot), and
// useSearchParams — needed to read the ?error flag the auth routes bounce back
// with — only works in a client component, behind a Suspense boundary.
//
// Two sign-in paths, gated by environment:
//   - Production: "Continue with Google" (OAuth) — the only sign-in method for
//     real users.
//   - Local dev: a magic-link form, because the local Supabase stack has no
//     Google provider configured and Mailpit captures the email.
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
    //
    // next=/library, not /onboarding: /library is the resolver that knows all
    // three post-sign-in destinations (own library, onboarding, public shelf),
    // so signing in lands you in your own library. /onboarding also forwards an
    // already-onboarded user, but it is a step in the flow rather than the
    // router for it.
    //
    // This URL must be in Supabase's Redirect URLs allow-list. When it is not,
    // Supabase silently falls back to the project's Site URL, which sends people
    // to the homepage with an unexchanged ?code and no session.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/library` },
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
      // enforced later, at profile creation, not here.
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

// Isolated in its own component for one reason: useSearchParams opts a page
// out of static HTML for everything inside its Suspense boundary. Keeping that
// boundary around the error message alone means the sign-in button below still
// ships in the prerendered HTML — which matters here, because this page is
// what Google's brand reviewer fetches, and a crawler that does not run JS
// would otherwise find "Start your library" with nothing under it.
function AuthError() {
  // Both auth route handlers bounce back here with an ?error flag on failure.
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const errorMessage =
    error === "link_invalid"
      ? "That sign-in link was invalid or expired. Request a new one below."
      : error === "oauth_failed"
        ? "Google sign-in didn't complete. Please try again."
        : null;

  if (!errorMessage) return null;

  return (
    <p className="mb-4 rounded-md border border-divider bg-background px-3 py-2 text-sm text-subtle">
      {errorMessage}
    </p>
  );
}

export function SignInPanel() {
  return (
    <div>
      {/* No fallback height: the error is absent on every normal visit, so
          reserving space for it would leave a permanent gap. It appears only
          on a redirect back from a failed sign-in, where the layout shifting
          slightly is not worth a gap the other 99% of the time. */}
      <Suspense fallback={null}>
        <AuthError />
      </Suspense>

      <GoogleSignIn />

      {/* Dev-only escape hatch; never rendered (and never invocable) in prod. */}
      {IS_DEV && <MagicLinkForm />}

      {/* No data-disclosure line under the button. Google's brand review does
          not ask for one, and in-app disclosure is only required for sensitive
          or restricted scopes; this requests basic profile and email. What the
          app reads is covered by the privacy policy linked at the foot of the
          page. If the scopes ever widen, that changes. */}
    </div>
  );
}
