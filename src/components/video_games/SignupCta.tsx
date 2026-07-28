"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Sign-up call to action for logged-out visitors on /video_games.
//
// This banner does double duty. It is the pitch on the public demo shelf, and
// it is also the page Google's OAuth brand verification points at as the "App
// homepage" — which requires a page that names the app, explains in text what
// it does, and links a privacy policy. All three are below, so keep them:
// APP_NAME in particular must stay byte-identical to the app name configured
// in the Google Cloud console, or the consent screen falls back to showing the
// raw supabase.co host.
//
// The app is "Video Game Library"; "Robert's" belongs to a particular library,
// not to the product someone signs into. Rendered inside the heading and the
// first sentence rather than alone, because the page heading directly above
// already reads "Robert's Video Game Library" and a bare repeat looks like a
// mistake.
const APP_NAME = "Video Game Library";

// Rendered by default and hidden after hydration if a session turns up, rather
// than the reverse. Two reasons. Logged-out visitors are both the overwhelming
// majority and the entire audience for this banner, so they get it instantly
// with no layout shift. And a signed-in viewer very rarely lands here at all:
// /library sends them to their own /u/{username}, so reaching /video_games
// while signed in means typing the URL or following an old link.
//
// The static HTML is identical for every viewer either way, which is what the
// caching strategy requires — only the post-hydration behavior differs.
export function SignupCta() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // onAuthStateChange fires with the current cookie session on mount, and
    // keeps up if the viewer signs in or out in another tab.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  if (signedIn) return null;

  return (
    <aside
      // Shelf tokens throughout: every one carries a light and a dark value,
      // so the banner follows the library's color scheme without dark: variants.
      className="mt-6 rounded-lg border border-shelf-input-border bg-shelf-input px-5 py-4 sm:px-6 sm:py-5"
    >
      <h2 className="text-lg font-semibold text-shelf-text sm:text-xl">
        Build your own {APP_NAME}
      </h2>
      {/* The heading carries the app name, which is what Google's brand
          verification looks for, so this states the purpose and stops. An
          earlier draft repeated the name here and then re-listed the same
          features a second time. */}
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-shelf-text-muted sm:text-base">
        Track every game you have played: what you finished, how you rated it, what you are playing
        now, and what you want to play next. Sign in to start yours.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          href="/video_games/login"
          // bg-link is the site's amber accent, paired with text-background as
          // on the login page: the accent flips amber-700 → amber-500 between
          // light and dark, and the background token flips with it, so the
          // label stays readable both ways (plain white would not).
          className="rounded-md bg-link px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Sign in to start your library
        </Link>
        {/* Required by Google's brand verification, and good practice anyway. */}
        <Link
          href="/privacy"
          className="text-sm text-shelf-text-muted underline underline-offset-4 transition-colors hover:text-shelf-text"
        >
          Privacy policy
        </Link>
      </div>
    </aside>
  );
}
