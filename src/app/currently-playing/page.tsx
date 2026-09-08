import { getGames } from "@/lib/libraryApi";
import { LIBRARY_OWNER_USERNAME } from "@/lib/games";
import { CrtTv } from "@/components/crt/CrtTv";
import { currentlyPlayingGames } from "@/components/video_games/playingPicker";

// Next.js convention: a `metadata` export sets the <title>/<meta> for this route.
// (React would have no equivalent — this is App Router's replacement for
// react-helmet / manually mutating document.title.)
export const metadata = {
  title: "Currently Playing | Robert Grassian",
};

// A Server Component (the App Router default — no "use client"). It runs only on
// the server, so it can call the server-only data layer directly and pass plain
// data to the client CRT. Async because getGames() may now fetch from the
// library API — App Router server components can be async and await data.
export default async function CurrentlyPlayingPage() {
  // Same helper the library page uses, so both CRTs order their channels the
  // same way: a game is "currently playing" when it has an open session (empty
  // end_date), and the newest-started one is channel 01.
  // Robert's own page, so the owner is pinned — this route is not part of the
  // /video-games/u/[username] family.
  const games = currentlyPlayingGames(await getGames(LIBRARY_OWNER_USERNAME));

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
