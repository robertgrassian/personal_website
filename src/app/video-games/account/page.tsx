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
//   - signed in, no profile→ /onboarding (nothing to show yet)
//   - signed in, onboarded → render the panel
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
  if (!profile) redirect("/onboarding");

  // Both reads are tagged and cached (libraryApi), and this viewer's library
  // page has almost certainly warmed them already, so the counts cost nothing
  // in practice. They are worth fetching: the confirm prompt naming "312 games"
  // is the difference between a warning someone reads and one they click past.
  const [games, wishlist] = await Promise.all([
    getGames(profile.username),
    getWishlist(profile.username),
  ]);

  return (
    <main className="min-h-screen bg-shelf-bg shelf-theme">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-shelf-text">Account</h1>

        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-shelf-text-muted">Signed in as</dt>
            <dd className="text-shelf-text">{user.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-shelf-text-muted">Username</dt>
            <dd className="text-shelf-text">{profile.username}</dd>
          </div>
        </dl>

        <p className="mt-6 text-sm">
          <Link
            href={userLibraryPath(profile.username)}
            className="text-link underline underline-offset-4"
          >
            Back to your library
          </Link>
        </p>

        <div className="mt-10 border-t border-shelf-plank pt-8">
          <h2 className="text-lg font-semibold text-shelf-text">Delete account</h2>
          <p className="mt-2 text-sm text-shelf-text">
            This removes your account and everything in it. There is no undo, and no backup to
            restore from.
          </p>
          <AccountPanel gameCount={games.length} wishlistCount={wishlist.length} />
        </div>
      </div>
    </main>
  );
}
