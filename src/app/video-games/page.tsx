import { LibraryPage } from "@/components/video_games/LibraryPage";
import { LIBRARY_OWNER_USERNAME } from "@/lib/games";

export const metadata = {
  title: "Video Game Library | Robert Grassian",
};

// Robert's shelf keeps this stable URL rather than redirecting to
// /video-games/u/rgrassian: existing links and SEO keep working, and it doubles
// as the logged-out demo. The page itself is now just the shared library shell
// with the owner pinned.
//
// No `heading` override any more: this URL and /video-games/u/rgrassian show
// the same library, so they should say the same thing. LibraryPage's default —
// "{displayName}'s Video Game Library" — is now correct for both, and dropping
// the prop means there is one fewer place for them to drift apart.
export default function VideoGamesPage() {
  return (
    <LibraryPage
      username={LIBRARY_OWNER_USERNAME}
      // This page doubles as the logged-out demo and as the "App homepage"
      // Google's OAuth brand verification points at — see SignupCta.
      showSignupCta
      // Only this route can say this. The founder's profile is seeded, not
      // user-created, so its absence is never "no such user" — it means the API
      // is pointed at an unmigrated or unseeded database, and LibraryPage
      // should fail loudly instead of rendering a 404. /video-games/u/[username]
      // takes a username off the URL and can never make that claim.
      missingProfileIsBug
    />
  );
}
