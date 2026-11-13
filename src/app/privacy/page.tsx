import { type Metadata } from "next";
import Link from "next/link";

// A Server Component (the App Router default — no "use client", so this renders
// to static HTML with zero JS shipped). Purely static content, so it's a plain
// function with no data fetching.

// Route-level metadata: Next merges this into <head> for /privacy. Exporting a
// `metadata` object is the App Router convention for per-page title/description.
export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How rgrassian.com collects, uses, and protects your data when you sign in, build a game library, or track produce.",
};

// Last substantive change to this policy. Bump when the content changes.
const LAST_UPDATED = "November 13, 2026";

// Inline prose-link styling: muted by default, accent + underline on hover.
// Consistent with the link treatment elsewhere on the site, and theme-aware
// because `text-link` maps to a CSS variable defined for both color schemes.
const proseLink = "text-link hover:underline";

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-subtle">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 space-y-6 text-body leading-relaxed">
        <p>
          This policy covers <span className="text-foreground">rgrassian.com</span>, a personal
          project. It explains what data the site collects when you sign in, build a game library,
          or track what produce you have eaten, and who processes it.
        </p>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Information I collect</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <span className="text-foreground">Account details from Google.</span> Your email
              address and basic profile information, such as your name. I never receive your Google
              password.
            </li>
            <li>
              <span className="text-foreground">Content you create.</span> Your username and display
              name, plus the games, play sessions, ratings, and wishlist entries you add.
            </li>
            <li>
              <span className="text-foreground">What you mark as eaten, on the produce page.</span>{" "}
              If you sign in and tap &ldquo;I ate this&rdquo;, the site stores which item it was and
              the date. This list is private: only you can see it.
            </li>
            <li>
              <span className="text-foreground">Approximate location, on the produce page.</span> To
              pick which state&apos;s produce to show, the page reads the approximate location your
              request comes from. It is used for that one redirect and never stored.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">How I use it</h2>
          <p className="mt-3">
            Only to run the service: signing you in, identifying your library by username, and
            storing and displaying what you create. All game libraries are currently public, so
            anyone who visits your library page can see your games, ratings, and profile details.
            Your produce list is not public. I do not sell your data or use it for advertising.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Who helps process your data</h2>
          <p className="mt-3">
            The site uses a few third-party services. Each receives only what its role requires:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <span className="text-foreground">Google:</span> sign-in. See Google&apos;s{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className={proseLink}
              >
                Privacy Policy
              </a>
              .
            </li>
            <li>
              <span className="text-foreground">Supabase:</span> database and authentication
              hosting, where your account and library are stored.
            </li>
            <li>
              <span className="text-foreground">Vercel:</span> application hosting and delivery.
            </li>
            <li>
              <span className="text-foreground">IGDB, accessed through Twitch:</span> game cover art
              shown in libraries. No personal data is sent.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Cookies</h2>
          <p className="mt-3">
            Signing in sets a secure session cookie so you stay logged in between page loads. It is
            used only for authentication. If you choose a state yourself on the produce page, one
            more cookie remembers that choice so the page opens there next time. There are no
            advertising or tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Retention and deletion</h2>
          <p className="mt-3">
            Your data is kept while your account exists. You can delete it yourself at any time from
            your{" "}
            <Link href="/account" className={proseLink}>
              account page
            </Link>
            . Deletion is immediate: it removes your profile, your sign-in record, and all library
            data, meaning games, play sessions, wishlist, and follows, along with your produce list.
            It cannot be undone or restored through the site. If you would rather not do it
            yourself, email me at the address below.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Changes to this policy</h2>
          <p className="mt-3">
            If this policy changes, the &ldquo;last updated&rdquo; date above will change too.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Contact</h2>
          <p className="mt-3">
            Questions about this policy or your data? Email{" "}
            <a href="mailto:rgrassian@gmail.com" className={proseLink}>
              rgrassian@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
