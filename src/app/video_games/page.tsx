import { getGames } from "@/lib/games";
import { GameLibrary } from "@/components/video_games/GameLibrary";
import { BackToHome } from "@/components/BackToHome";

// Next.js reads this export to set the <title> and <meta> for this route.
// This is a Next.js App Router convention — works only in Server Components and layouts.
export const metadata = {
  title: "Game Library | Robert Grassian",
};

// This is a Server Component — no "use client" directive, so it runs on the server.
// Server Components can use Node.js APIs (like `fs`) directly, which is how getGames() works.
// After running on the server, the resulting HTML + serialized Game[] props are sent to the
// browser, where the Client Component (GameLibrary) hydrates and takes over interactivity.
export default function VideoGamesPage() {
  const games = getGames();

  return (
    <main className="min-h-screen bg-shelf-bg shelf-theme">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <BackToHome className="text-shelf-text-link" />
        <h1 className="mt-6 text-4xl font-bold text-shelf-text">Game Library</h1>
        <p className="mt-2 text-shelf-text-muted">{games.length} games</p>

        {/*
          GameLibrary is a "use client" component — it owns all filter/sort state.
          Passing Game[] as a prop is the standard Next.js data-flow pattern:
            Server fetches data → serializes it to JSON → Client Component receives it as props.

          One constraint: props passed from Server to Client must be serializable
          (no functions, no class instances) — plain objects and arrays only. Game[] fits perfectly.
        */}
        <GameLibrary games={games} />
      </div>
    </main>
  );
}
