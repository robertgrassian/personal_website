import { Suspense } from "react";
import { notFound } from "next/navigation";
// The stylesheets live with the component that needs them rather than in each
// route's layout: two routes render this shell now, and a per-route import
// would be two places to remember. App Router allows CSS imports from any
// component, unlike the Pages Router's global-CSS restriction.
import "@/app/video_games/video_games.css";
import "@/components/crt/crt.css";
import { getGames } from "@/lib/gamesServer";
import { getWishlist } from "@/lib/wishlistServer";
import { getProfile } from "@/lib/profileServer";
import { GameLibrary } from "@/components/video_games/GameLibrary";
import { CrtTv } from "@/components/crt/CrtTv";
import { LibraryCount } from "@/components/video_games/LibraryCount";
import { AuthButton } from "@/components/AuthButton";
import { SignupCta } from "@/components/video_games/SignupCta";

// One library page, two routes: /video_games (Robert's shelf, at its stable
// URL) and /u/[username] (anyone's). Extracted so the two can never drift —
// the only difference between them is which username they pass in.
//
// Async Server Component — a Next.js App Router convention: server components
// may be async functions and `await` data before rendering.
type LibraryPageProps = {
  username: string;
  // What the <h1> says. /video_games pins its established "Video Game
  // Library"; /u/[username] omits it and gets the owner's display name, which
  // comes from the profile rather than the URL segment so the casing is
  // canonical (usernames are citext — /u/RGrassian resolves to the same user).
  heading?: string;
  // Show the logged-out sign-up pitch. Only /video_games sets this: that page
  // is the public demo shelf and the URL Google's OAuth brand verification
  // points at. A user's own /u/{username} is not a marketing surface.
  showSignupCta?: boolean;
};

export async function LibraryPage({ username, heading, showSignupCta = false }: LibraryPageProps) {
  // Awaited first and alone: a username nobody owns must become a 404 page,
  // not the loud "the API is unwell" error that getGames() would throw for
  // the same 404. Costs one extra round trip on a cache miss, and the three
  // reads share a cache tag so they warm and expire together.
  const profile = await getProfile(username);
  if (!profile) notFound();

  // Independent, so Promise.all runs them concurrently instead of
  // serializing two API round-trips.
  const [games, wishlist] = await Promise.all([getGames(username), getWishlist(username)]);
  // All in-progress games — the CRT cycles through them like TV channels, and
  // the stats panel uses them so "Recently Played" can include a currently-playing
  // game even when it's unrated (and thus absent from the rated shelves below).
  // Filtered before the rating cut below, so an unrated in-progress game still
  // appears on the CRT.
  const currentlyPlayingGames = games.filter((g) => g.currentlyPlaying);
  // Shelves hold finished, rated games only. A game with no rating yet (usually
  // the one currently being played) is excluded here; once it gets a rating it
  // shows up on the shelves — and in both places if it's still being played.
  const libraryGames = games.filter((g) => g.rating !== "");
  // Unrated games power the owner-only "Unrated" shelf inside GameLibrary —
  // without it, clearing a rating would make a game unreachable from the UI
  // (no case, no pencil, no way to re-rate). Passed for every viewer but only
  // rendered after the client-side owner check, so the static HTML stays
  // identical for everyone.
  const unratedGames = games.filter((g) => g.rating === "");
  // Headline counts. "Played" spans the whole collection you've engaged with:
  // every rated game plus anything currently in progress. The `||` de-dupes a
  // game that's both rated and currently playing — it's counted once.
  const playedCount = games.filter((g) => g.rating !== "" || g.currentlyPlaying).length;
  const wishlistCount = wishlist.length;

  return (
    <main className="min-h-screen bg-shelf-bg shelf-theme">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* The sign-in/out control lives here rather than the global nav: the
            portfolio has no accounts, the library is the only app that does.
            items-start keeps it aligned to the heading's first line when a
            long display name wraps. */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-shelf-text">
              {heading ?? `${profile.displayName}'s Game Library`}
            </h1>
            {/* Whose library this is. On /u/[username] the heading already
                carries the display name, so the handle is what adds
                information; on /video_games the heading is generic and this is
                the only thing naming the owner. Rendered from the profile, so
                the casing is the stored one rather than whatever the URL used.
                Follower/following counts belong here too, but not until Phase 5
                gives them a follow button and lists to be actionable with. */}
            <p className="mt-1 text-sm text-shelf-text-muted">@{profile.username}</p>
          </div>
          <AuthButton />
        </div>
        {/* useSearchParams (inside LibraryCount) requires a Suspense boundary.
            The fallback shows the default-view count so there's no flash. */}
        <Suspense fallback={<p className="mt-2 text-shelf-text-muted">{playedCount} games</p>}>
          <LibraryCount playedCount={playedCount} wishlistCount={wishlistCount} />
        </Suspense>

        {showSignupCta && <SignupCta />}

        {currentlyPlayingGames.length > 0 && <CrtTv games={currentlyPlayingGames} compact />}

        {/* Suspense is required because GameLibrary uses useSearchParams() */}
        <Suspense fallback={null}>
          <GameLibrary
            games={libraryGames}
            wishlist={wishlist}
            currentlyPlayingGames={currentlyPlayingGames}
            unratedGames={unratedGames}
            // Which library this is. GameLibrary hands it to useIsLibraryOwner
            // so the viewer's own username can be compared against it.
            ownerUsername={profile.username}
          />
        </Suspense>
      </div>
    </main>
  );
}
