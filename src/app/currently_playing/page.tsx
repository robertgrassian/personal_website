import { getGames } from "@/lib/gamesServer";
import { CrtTv } from "@/components/currently_playing/CrtTv";

// Next.js convention: a `metadata` export sets the <title>/<meta> for this route.
// (React would have no equivalent — this is App Router's replacement for
// react-helmet / manually mutating document.title.)
export const metadata = {
  title: "Currently Playing | Robert Grassian",
};

// A Server Component (the App Router default — no "use client"). It runs only on
// the server, so it can call the server-only data layer directly and pass plain
// data to the client CRT. `getGames()` reads CSVs from disk synchronously, so no
// async/await is needed.
export default function CurrentlyPlayingPage() {
  // Same filter the game library uses (video_games/page.tsx): a game is
  // "currently playing" when it has an open session (empty end_date).
  const games = getGames().filter((g) => g.currentlyPlaying);

  return (
    // Base site tokens (bg-background/text-foreground) keep the page chrome
    // correct in light and dark mode; the TV itself is a self-contained dark
    // object that looks the same either way.
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-12">
        <h1 className="self-start text-4xl font-bold">Currently Playing</h1>
        <CrtTv games={games} />
      </div>
    </main>
  );
}
