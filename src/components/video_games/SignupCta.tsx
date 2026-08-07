import Link from "next/link";
import { APP_NAME } from "@/lib/appName";
import { accentButtonClass } from "./formStyles";

// Sign-up call to action for logged-out visitors on /video-games.
//
// The pitch on the public demo shelf, and the top of the funnel into
// /video-games/start, which is the page Google's OAuth brand verification
// points at as the "App homepage".
//
// This banner used to carry that role itself, and Google rejected it: a shelf
// of cover art with one sentence of prose does not read as a page explaining
// an app, and the h1 above it says "Robert's Video Game Library" where the
// console says "Video Game Library". Both jobs moved to the landing page. What
// stays here is the invitation.
//
// Rendered inside the heading rather than alone, because the page heading
// directly above already reads "Robert's Video Game Library" and a bare repeat
// looks like a mistake.

// No longer a Client Component. It used to hide itself in a useEffect once
// onAuthStateChange reported a session, so signed-in viewers necessarily saw one
// frame of it. Visibility now comes from data-hide-authed plus the pre-paint
// flag in src/lib/authFlag.ts. Dropping "use client" means this ships no
// JavaScript at all, and the markup stays viewer-identical.
export function SignupCta() {
  return (
    <aside
      // Dropped by CSS before first paint for viewers with a session.
      // Presence-only attribute, hence the empty value.
      data-hide-authed=""
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
          href="/video-games/start"
          // bg-link is the site's amber accent, paired with text-background as
          // on the login page: the accent flips amber-700 → amber-500 between
          // light and dark, and the background token flips with it, so the
          // label stays readable both ways (plain white would not).
          className={`${accentButtonClass} text-sm`}
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
