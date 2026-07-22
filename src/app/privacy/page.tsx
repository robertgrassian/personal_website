import { type Metadata } from "next";

// A Server Component (the App Router default — no "use client", so this renders
// to static HTML with zero JS shipped). Purely static content, so it's a plain
// function with no data fetching.

// Route-level metadata: Next merges this into <head> for /privacy. Exporting a
// `metadata` object is the App Router convention for per-page title/description.
export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How rgrassian.com collects, uses, and protects your data when you sign in and build a game library.",
};

// Last substantive change to this policy. Bump when the content changes.
const LAST_UPDATED = "July 22, 2026";

// Inline prose-link styling: muted by default, accent + underline on hover —
// consistent with the link treatment elsewhere on the site, and theme-aware
// because `text-link` maps to a CSS variable defined for both color schemes.
const proseLink = "text-link hover:underline";

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-subtle">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 space-y-6 text-body leading-relaxed">
        <p>
          This site is a personal project. This policy explains, in plain terms, what data it
          collects when you sign in and build a game library, why, and who helps process it. It
          applies to <span className="text-foreground">rgrassian.com</span>.
        </p>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Information I collect</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <span className="text-foreground">Account details from Google.</span> When you sign in
              with Google, I receive your email address and basic profile information (such as your
              name). I do not receive your Google password.
            </li>
            <li>
              <span className="text-foreground">Content you create.</span> The username and display
              name you choose during onboarding, and the games, play sessions, ratings, and wishlist
              entries you add to your library.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">How I use it</h2>
          <p className="mt-3">
            Your data is used only to run the service: to sign you in, to identify your library by
            username, and to store and display the games and lists you create. All libraries are
            public in the current version, so the games, ratings, and profile details you add are
            visible to anyone who visits your library page. I do not sell your data or use it for
            advertising.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Who helps process your data</h2>
          <p className="mt-3">
            The site relies on a small number of third-party services to operate. Each only receives
            the data needed for its role:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <span className="text-foreground">Google</span> — sign-in (authentication). See
              Google&apos;s{" "}
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
              <span className="text-foreground">Supabase</span> — database and authentication
              hosting, where your account and library are stored.
            </li>
            <li>
              <span className="text-foreground">Vercel</span> — application hosting and delivery.
            </li>
            <li>
              <span className="text-foreground">IGDB</span> — source of game cover-art images shown
              in libraries.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Cookies</h2>
          <p className="mt-3">
            Signing in sets a secure, session cookie so the site can keep you logged in between page
            loads. It is used only for authentication — there are no advertising or tracking
            cookies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Retention and deletion</h2>
          <p className="mt-3">
            Your data is kept for as long as you have an account. Deleting your account removes your
            profile and all associated library data (games, sessions, and wishlist), and removes
            your sign-in record.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Changes to this policy</h2>
          <p className="mt-3">
            If this policy changes, the &ldquo;last updated&rdquo; date above will change to reflect
            it.
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
