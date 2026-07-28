import { LibraryPage } from "@/components/video_games/LibraryPage";
import { LIBRARY_OWNER_USERNAME } from "@/lib/games";

export const metadata = {
  title: "Video Game Library | Robert Grassian",
};

// Robert's shelf keeps this stable URL rather than redirecting to
// /u/rgrassian (spec decision #5): existing links and SEO keep working, and
// it doubles as the logged-out demo. The page itself is now just the shared
// library shell with the owner pinned.
export default function VideoGamesPage() {
  return (
    <LibraryPage
      username={LIBRARY_OWNER_USERNAME}
      heading="Video Game Library"
      // This page doubles as the logged-out demo and as the "App homepage"
      // Google's OAuth brand verification points at — see SignupCta.
      showSignupCta
    />
  );
}
