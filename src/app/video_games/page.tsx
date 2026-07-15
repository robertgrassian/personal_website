import { Suspense } from "react";
import { getGames } from "@/lib/gamesServer";
import { GameLibrary } from "@/components/video_games/GameLibrary";
import { CurrentlyPlaying } from "@/components/video_games/CurrentlyPlaying";
import { getWishlist } from "@/lib/wishlistServer";

export const metadata = {
  title: "Video Game Library | Robert Grassian",
};

export default function VideoGamesPage() {
  const games = getGames();
  const wishlist = getWishlist();
  // First flagged game wins; undefined (nothing flagged) hides the section entirely.
  // Found before the rating filter below, so an unrated in-progress game still
  // appears on the CRT.
  const nowPlaying = games.find((g) => g.currentlyPlaying);
  // Shelves hold finished, rated games only. A game with no rating yet (usually
  // the one currently being played) is excluded here; once it gets a rating it
  // shows up on the shelves — and in both places if it's still being played.
  const libraryGames = games.filter((g) => g.rating !== "");

  return (
    <main className="min-h-screen bg-shelf-bg shelf-theme">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-shelf-text">Video Game Library</h1>
        <p className="mt-2 text-shelf-text-muted">{libraryGames.length} games</p>

        {nowPlaying && <CurrentlyPlaying game={nowPlaying} />}

        {/* Suspense is required because GameLibrary uses useSearchParams() */}
        <Suspense fallback={null}>
          <GameLibrary games={libraryGames} wishlist={wishlist} />
        </Suspense>
      </div>
    </main>
  );
}
