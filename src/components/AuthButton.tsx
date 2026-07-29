"use client";

// Sign-in / sign-out control for the game library header. Client Component
// because auth state is a live, browser-side concern: onAuthStateChange pushes
// updates (sign-in completes in the /auth/confirm tab, sign-out, token
// refresh) and this re-renders without a page reload.
//
// It lives in the library rather than the global nav on purpose: the portfolio
// (/, /about, /resume) is static content with no accounts, and the game
// library is the only app here with sign-in. The auth *infrastructure* stays
// site-wide (one session cookie on the domain, middleware refresh, /auth/*
// handlers) so a future app can share the session — only the surfaces moved.
//
// This reflects the session for DISPLAY only. It is never a security boundary
// — every protected read/write is authorized server-side by FastAPI verifying
// the JWT. A spoofed client state here changes nothing real.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Shelf tokens, not the global ones: this sits on the library's own background
// (.shelf-theme), where text-subtle would be low-contrast. Both tokens carry
// light and dark values.
const linkClass =
  "text-sm whitespace-nowrap text-shelf-text-muted hover:text-shelf-text " +
  "underline underline-offset-4 transition-colors duration-150";

export function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  // Undefined-until-known guard: render nothing until the first auth event, so
  // the button doesn't flash "Sign in" for a moment on an authenticated load.
  const [known, setKnown] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    // onAuthStateChange fires INITIAL_SESSION synchronously-ish on mount with
    // the current cookie session — no separate getUser round-trip needed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setKnown(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Refresh Server Components so any server-rendered auth-dependent UI
    // re-evaluates with the now-absent session.
    router.refresh();
  }

  if (!known) return null;

  if (!user) {
    return (
      <Link href="/video-games/start" className={linkClass}>
        Sign in
      </Link>
    );
  }

  return (
    <button type="button" onClick={signOut} className={linkClass}>
      Sign out
    </button>
  );
}
