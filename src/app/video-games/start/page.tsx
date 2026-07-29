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
    `${APP_NAME} is a place to track every video game you have ever played — ` +
    `what you finished, how you rated it, what you are playing now, and what ` +
    `you want to play next.`,
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

      <p className="mt-4 text-lg leading-relaxed text-foreground">
        A place to keep every video game you have ever played — what you finished, how you rated it,
        what you are playing right now, and what you want to play next.
      </p>

      <div className="mt-6 flex flex-col gap-4 text-subtle">
        <p className="leading-relaxed">
          Your games sit on shelves you can group and sort however you like: by system, by rating,
          by genre, by decade. Rate them, log when you start and finish a playthrough, and keep a
          wishlist of what is next.
        </p>
        <p className="leading-relaxed">
          Every library has its own public page, so you can share yours with a link. Signing in with
          Google is all it takes to start one.
        </p>
      </div>

      {/* A live example does more than a screenshot to explain the product,
          and it costs nothing to maintain — it is the real library. */}
      <p className="mt-6 text-subtle">
        Not sure what it looks like?{" "}
        <Link
          href={`/u/${LIBRARY_OWNER_USERNAME}`}
          className="text-link underline underline-offset-4"
        >
          Browse Robert&apos;s library
        </Link>{" "}
        — every game he has played, which is what this app was built to keep track of.
      </p>

      <div className="mt-10 border-t border-divider pt-8">
        <h2 className="text-lg font-semibold text-foreground">Start your library</h2>
        <div className="mt-4 max-w-sm">
          <SignInPanel />
        </div>
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
