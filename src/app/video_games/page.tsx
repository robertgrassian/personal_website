import { Suspense } from "react";
import { getGames } from "@/lib/gamesServer";
import { GameLibrary } from "@/components/video_games/GameLibrary";
import { getWishlist } from "@/lib/wishlistServer";

export const metadata = {
  title: "Game Library | Robert Grassian",
};

export default function VideoGamesPage() {
  const games = getGames();
  const wishlist = getWishlist();

  return (
    <main className="min-h-screen bg-shelf-bg shelf-theme">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-shelf-text">Game Library</h1>
        <p className="mt-2 text-shelf-text-muted">{games.length} games</p>

        {/* Suspense is required because GameLibrary uses useSearchParams() */}
        <Suspense fallback={null}>
          <GameLibrary games={games} wishlist={wishlist} />
        </Suspense>
      </div>
    </main>
  );
}
