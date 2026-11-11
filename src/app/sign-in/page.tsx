import type { Metadata } from "next";
import Link from "next/link";
import { SignInPanel } from "@/components/auth/SignInPanel";
import { safeNextPath } from "@/lib/nextPath";

// The site's sign-in page. Any app links here with `?next=<its own path>` and
// gets the visitor back afterwards. Signing in creates a site account only;
// an app's own per-user data (a game library profile) is a separate step.
//
// Kept apart from /video-games/start, which is the game library's pitch page
// and the "App homepage" Google's OAuth brand review reads. This one is a bare
// form, which is exactly what that review rejected, hence noindex and no app
// name.
//
// Reading searchParams makes this page dynamic. Acceptable for a small form
// page, and it lets `next` reach SignInPanel as a prop rather than every
// caller reading the URL itself.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to rgrassian.com.",
  robots: { index: false },
};

export default async function SignInPage({
  searchParams,
}: {
  // A Promise in Next 15: page props are resolved lazily.
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const raw = (await searchParams).next;
  // Guarded here, not just in the route handlers: this value goes to the
  // browser as a relative URL inside the OAuth redirect.
  const next = safeNextPath(typeof raw === "string" ? raw : null, "/library");

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold text-foreground">Sign in</h1>
      <p className="mt-3 leading-relaxed text-foreground">
        One account works across the whole site.
      </p>

      <div className="mt-8">
        <SignInPanel next={next} />
      </div>

      <p className="mt-10 border-t border-divider pt-6 text-sm text-subtle">
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy policy
        </Link>
      </p>
    </main>
  );
}
