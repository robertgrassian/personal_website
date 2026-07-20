"use client";

// Magic-link sign-in page. A Client Component because it holds form state and
// calls the browser Supabase client directly — signInWithOtp only *sends* the
// email (no session yet), so there's nothing for a Server Action to do here.
// The session is established later by /auth/confirm when the emailed link is
// clicked.
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  // A small state machine beats three booleans: exactly one status at a time.
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  // The route handler redirects here with ?error=link_invalid when a link is
  // expired or malformed; surface it so the user knows to request a new one.
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error") === "link_invalid";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Local dev signs up brand-new emails on the spot (production is
        // OAuth-only). The MAX_USERS cap is enforced later, at profile
        // creation (spec §6), not here.
        shouldCreateUser: true,
      },
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
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Check your email</h1>
        <p className="mt-3 text-subtle">
          We sent a sign-in link to <span className="text-foreground">{email}</span>. Click it to
          finish signing in.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Sign in</h1>
      <p className="mt-2 text-subtle">
        Enter your email and we&apos;ll send you a magic link — no password needed.
      </p>

      {linkError && (
        <p className="mt-4 rounded-md border border-divider bg-background px-3 py-2 text-sm text-subtle">
          That sign-in link was invalid or expired. Request a new one below.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-divider bg-background px-3 py-2 text-foreground placeholder:text-subtle focus:border-link focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-md bg-link px-4 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Send magic link"}
        </button>
      </form>

      {status === "error" && (
        // --rating-f carries light/dark values (globals.css), so this error
        // color adapts to both themes without a dark: variant.
        <p className="mt-4 text-sm" style={{ color: "var(--rating-f)" }}>
          {message}
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-16">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
