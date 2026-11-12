// Account settings (Server Component). Today it holds exactly one thing:
// deleting your account.
//
// Top-level rather than under /video-games: the account belongs to the site,
// and every app's per-user data hangs off it. It used to live at
// /video-games/account in the shelf theme; next.config.ts redirects the old URL.
//
// A self-resolving page in the same shape as /onboarding and /library:
//   - not signed in        → /sign-in, returning here
//   - signed in, no profile→ render the panel without a library
//   - signed in, onboarded → render the panel
//
// The no-profile case is a normal account, not an unfinished one: signing in
// creates the auth user, and a game library profile is a separate step the
// visitor may never take. The delete works the same either way.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchMyProfile } from "@/lib/meApi";
import { getGames, getWishlist } from "@/lib/libraryApi";
import { userLibraryPath } from "@/lib/profile";
import { signInPath } from "@/lib/nextPath";
import "./account.css";
import { AccountPanel } from "./AccountPanel";

// Per-request (reads the session cookie) — never statically rendered.
export const dynamic = "force-dynamic";

// Sentinel for "the profile fetch failed", so it stays distinguishable from
// the null that means "no profile yet". A string literal rather than a third
// boolean lets TypeScript narrow `profile` to MyProfile on one comparison.
const UNAVAILABLE = "unavailable" as const;

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your rgrassian.com account.",
};

export default async function AccountPage() {
  // Same degradation as /library and /onboarding: unconfigured means nobody is
  // signed in.
  if (!isSupabaseConfigured()) redirect(signInPath("/account"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(signInPath("/account"));

  // Three states, not two. fetchMyProfile returns null ONLY for the genuine
  // "signed in, no profile" 404; it throws on an unreachable hop and on any
  // other bad status. That throw used to escape and error the whole route,
  // which is the exact failure the comment on the two guarded reads below
  // argues against — the delete control went missing precisely when the site
  // was misbehaving.
  //
  // The failure is kept distinct from null rather than collapsed into it,
  // because the page says different things: offering "create a profile" to
  // someone whose profile merely failed to load is a lie, and the weaker
  // confirm phrase needs explaining rather than silently appearing.
  const profile = await fetchMyProfile().catch(() => UNAVAILABLE);
  const detailsUnavailable = profile === UNAVAILABLE;
  // Narrowed once here so the JSX below can stay a plain null check. The
  // narrowing survives the const boolean above (TypeScript tracks a condition
  // stored in a const back to the check that produced it), so this types as
  // MyProfile | null with no cast.
  const myProfile = detailsUnavailable ? null : profile;

  // Both reads are tagged and cached (libraryApi), and this viewer's library
  // page has almost certainly warmed them already, so the counts cost nothing
  // in practice. They are worth fetching: the confirm prompt naming "312 games"
  // is the difference between a warning someone reads and one they click past.
  //
  // Best-effort, though. getGames and getWishlist throw when the library API is
  // unwell, which would error the whole page and make the delete control
  // unreachable exactly when the site is misbehaving — the moment someone is
  // most likely to want it. A null count drops the number from the prompt and
  // changes nothing else.
  const counts = myProfile
    ? await Promise.all([
        getGames(myProfile.username).catch(() => null),
        getWishlist(myProfile.username).catch(() => null),
      ])
    : null;
  const gameCount = counts?.[0]?.length ?? null;
  const wishlistCount = counts?.[1]?.length ?? null;

  return (
    // Site tokens throughout; each carries light and dark values in globals.css.
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-foreground">Account</h1>

      <dl className="mt-6 space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="text-subtle">Signed in as</dt>
          <dd className="text-foreground">{user.email}</dd>
        </div>
        {myProfile !== null && (
          <div className="flex gap-2">
            <dt className="text-subtle">Username</dt>
            <dd className="text-foreground">{myProfile.username}</dd>
          </div>
        )}
      </dl>

      {/* Three branches matching the three states above. The degraded one
          offers no link at all: "back to your library" needs a username we
          do not have, and "create a profile" would be wrong for the likely
          case that the profile exists and only the read failed. */}
      <p className="mt-6 text-sm">
        {detailsUnavailable ? (
          <span className="text-subtle">
            We could not load your account details just now. Everything below still works, and your
            username will be back once the library is reachable again.
          </span>
        ) : myProfile !== null ? (
          <Link
            href={userLibraryPath(myProfile.username)}
            className="text-link underline underline-offset-4"
          >
            Back to your library
          </Link>
        ) : (
          <Link href="/onboarding" className="text-link underline underline-offset-4">
            Create a game library profile
          </Link>
        )}
      </p>

      <div className="account-controls mt-10 border-t border-divider pt-8">
        <h2 className="text-lg font-semibold text-foreground">Delete account</h2>
        <p className="mt-2 text-sm text-foreground">
          This removes your account and everything in it. It cannot be undone, and it cannot be
          restored through the site.
        </p>
        <AccountPanel
          username={myProfile?.username ?? null}
          detailsUnavailable={detailsUnavailable}
          gameCount={gameCount}
          wishlistCount={wishlistCount}
        />
      </div>
    </main>
  );
}
