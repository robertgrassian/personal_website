// Account settings (Server Component). Today it holds exactly one thing:
// deleting your account.
//
// Nested under /video-games rather than a top-level /account because the game
// library owns that prefix, and because everything inside it renders in the
// shelf theme, which is what lets this page reuse ConfirmStep and formStyles
// unchanged.
//
// A self-resolving page in the same shape as /onboarding and /library:
//   - not signed in        → /video-games/start
//   - signed in, no profile→ render the panel without a library
//   - signed in, onboarded → render the panel
//
// The no-profile case is NOT sent to /onboarding, unlike every other resolver
// here. Signing in with Google mints the auth user before onboarding runs, so
// someone who lands on the username picker and decides they do not want an
// account still has a real account. The endpoint deletes it fine; bouncing
// them to /onboarding would be the only thing standing between them and the
// delete they came for.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchMyProfile } from "@/lib/meApi";
import { getGames, getWishlist } from "@/lib/libraryApi";
import { userLibraryPath } from "@/lib/profile";
import "@/app/video-games/video-games.css";
import { AccountPanel } from "./AccountPanel";

// Per-request (reads the session cookie) — never statically rendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your game library account.",
};

export default async function AccountPage() {
  // Same degradation as /library and /onboarding: unconfigured means nobody is
  // signed in.
  if (!isSupabaseConfigured()) redirect("/video-games/start");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/video-games/start");

  const profile = await fetchMyProfile();

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
  const counts = profile
    ? await Promise.all([
        getGames(profile.username).catch(() => null),
        getWishlist(profile.username).catch(() => null),
      ])
    : null;
  const gameCount = counts?.[0]?.length ?? null;
  const wishlistCount = counts?.[1]?.length ?? null;

  return (
    <main className="min-h-screen bg-shelf-bg shelf-theme">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-shelf-text">Account</h1>

        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-shelf-text-muted">Signed in as</dt>
            <dd className="text-shelf-text">{user.email}</dd>
          </div>
          {profile !== null && (
            <div className="flex gap-2">
              <dt className="text-shelf-text-muted">Username</dt>
              <dd className="text-shelf-text">{profile.username}</dd>
            </div>
          )}
        </dl>

        <p className="mt-6 text-sm">
          {profile !== null ? (
            <Link
              href={userLibraryPath(profile.username)}
              className="text-link underline underline-offset-4"
            >
              Back to your library
            </Link>
          ) : (
            <Link href="/onboarding" className="text-link underline underline-offset-4">
              Finish setting up your library
            </Link>
          )}
        </p>

        <div className="mt-10 border-t border-shelf-plank pt-8">
          <h2 className="text-lg font-semibold text-shelf-text">Delete account</h2>
          <p className="mt-2 text-sm text-shelf-text">
            This removes your account and everything in it. It cannot be undone, and it cannot be
            restored through the site.
          </p>
          <AccountPanel
            username={profile?.username ?? null}
            gameCount={gameCount}
            wishlistCount={wishlistCount}
          />
        </div>
      </div>
    </main>
  );
}
