import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/appName";
import { LIBRARY_OWNER_USERNAME } from "@/lib/games";
import { SignInPanel } from "./SignInPanel";

// The product's front door, and the URL configured as "App homepage" in
// Google's OAuth consent screen.
//
// That second role sets the requirements. Google's brand review rejects a
// homepage that does not explain what the app does, and rejects one whose
// visible name disagrees with the console's App name. The first version of
// this page was a bare sign-in form headed "Sign in" and failed on both
// counts. So the name and the purpose are the page's own content here, and
// signing in is a section within it rather than the whole of it.
//
// Deliberately NOT the site's entry point: /library still resolves signed-out
// visitors to /video-games (Robert's shelf, the public demo) and signed-in
// ones to their own library. Google only requires that this URL exist, be
// public, and describe the app — not that anyone is routed through it.
//
// Server component, so it can export `metadata`. The interactive half lives in
// SignInPanel ("use client").
export const metadata: Metadata = {
  // Leads with the bare app name: this is the page Google reads the name from,
  // and the <title> is the first place a reviewer looks.
  title: `${APP_NAME} | Robert Grassian`,
  description:
    `${APP_NAME} keeps track of every video game you have played: what you ` +
    `finished, how you rated it, what you are playing now, and what you want ` +
    `to play next.`,
};

export default function StartPage() {
  return (
    // Tokens throughout (foreground, subtle, divider, link, background) all
    // carry light and dark values in globals.css, so the page follows the
    // viewer's color scheme without any dark: variants.
    <main className="mx-auto max-w-2xl px-6 py-16">
      {/* The exact app name, alone, as the page's h1. Google compares this
          against the console's App name, so it must not be decorated with a
          person's name or a tagline. */}
      <h1 className="text-4xl font-bold text-foreground">{APP_NAME}</h1>

      {/* Body copy uses text-foreground, not text-subtle. In dark mode
          --subtle is #6b7280 on a #0a0a0a background, which measures 4.1:1
          against the 4.5:1 WCAG AA minimum for body text, so it is too low
          for prose. Reserved below for the one line of small print. */}
      <p className="mt-4 text-lg leading-relaxed text-foreground">
        Keep track of every video game you have played: what you finished, how you rated it, what
        you are playing now, and what you want to play next.
      </p>

      {/* Sign-in sits high, but never above the h1 and the purpose line. A
          page that opens with a sign-in form is what Google's brand review
          rejected the first time, and the reviewer reads top down. */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Start your library</h2>
        <div className="mt-4 max-w-sm">
          <SignInPanel />
        </div>
      </div>

      <div className="mt-10 border-t border-divider pt-8">
        <p className="leading-relaxed text-foreground">
          Your games sit on shelves you can group and sort by system, rating, genre, or decade.
          Every library has its own public page, so you can share yours with a link.
        </p>

        {/* A live example explains the product better than a screenshot, and
            costs nothing to maintain, because it is the real library. */}
        <p className="mt-4 leading-relaxed text-foreground">
          <Link
            href={`/u/${LIBRARY_OWNER_USERNAME}`}
            className="text-link underline underline-offset-4"
          >
            See an example library
          </Link>
          .
        </p>
      </div>

      {/* Google's brand review expects the privacy policy reachable from the
          homepage, and it is good practice regardless. */}
      <p className="mt-10 border-t border-divider pt-6 text-sm text-subtle">
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy policy
        </Link>
      </p>
    </main>
  );
}
