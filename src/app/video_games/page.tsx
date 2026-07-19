import { Suspense } from "react";
import { getGames } from "@/lib/gamesServer";
import { GameLibrary } from "@/components/video_games/GameLibrary";
import { CrtTv } from "@/components/crt/CrtTv";
import { LibraryCount } from "@/components/video_games/LibraryCount";
import { getWishlist } from "@/lib/wishlistServer";

export const metadata = {
  title: "Video Game Library | Robert Grassian",
};

export default function VideoGamesPage() {
  const games = getGames();
  const wishlist = getWishlist();
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
  // Headline counts. "Played" spans the whole collection you've engaged with:
  // every rated game plus anything currently in progress. The `||` de-dupes a
  // game that's both rated and currently playing — it's counted once.
  const playedCount = games.filter((g) => g.rating !== "" || g.currentlyPlaying).length;
  const wishlistCount = wishlist.length;

  return (
    <main className="min-h-screen bg-shelf-bg shelf-theme">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-shelf-text">Video Game Library</h1>
        {/* useSearchParams (inside LibraryCount) requires a Suspense boundary.
            The fallback shows the default-view count so there's no flash. */}
        <Suspense fallback={<p className="mt-2 text-shelf-text-muted">{playedCount} games</p>}>
          <LibraryCount playedCount={playedCount} wishlistCount={wishlistCount} />
        </Suspense>

        {currentlyPlayingGames.length > 0 && <CrtTv games={currentlyPlayingGames} compact />}

        {/* Suspense is required because GameLibrary uses useSearchParams() */}
        <Suspense fallback={null}>
          <GameLibrary
            games={libraryGames}
            wishlist={wishlist}
            currentlyPlayingGames={currentlyPlayingGames}
          />
        </Suspense>
      </div>
    </main>
  );
}
