import { Suspense } from "react";
import { notFound } from "next/navigation";
// The stylesheets live with the component that needs them rather than in each
// route's layout: two routes render this shell now, and a per-route import
// would be two places to remember. App Router allows CSS imports from any
// component, unlike the Pages Router's global-CSS restriction.
import "@/app/video-games/video-games.css";
import "@/components/crt/crt.css";
import { getFollowers, getFollowing, getGames, getProfile, getWishlist } from "@/lib/libraryApi";
import { LIBRARY_OWNER_USERNAME } from "@/lib/games";
import { GameLibrary } from "@/components/video_games/GameLibrary";
import { CrtTv } from "@/components/crt/CrtTv";
import { LibraryCount } from "@/components/video_games/LibraryCount";
import { AuthButton } from "@/components/AuthButton";
import {
  FollowStateProvider,
  FollowButton,
  BackToMyLibrary,
} from "@/components/video_games/FollowControls";
import {
  FollowCountLinks,
  FollowCountLinksFallback,
} from "@/components/video_games/FollowCountLinks";
import { SignupCta } from "@/components/video_games/SignupCta";

// One library page, two routes: /video-games (Robert's shelf, at its stable
// URL) and /video-games/u/[username] (anyone's). Extracted so the two can never
// drift — the only difference between them is which username they pass in.
//
// Async Server Component — a Next.js App Router convention: server components
// may be async functions and `await` data before rendering.
type LibraryPageProps = {
  username: string;
  // Show the logged-out sign-up pitch. Only /video-games sets this: that page
  // is the public demo shelf and the URL Google's OAuth brand verification
  // points at. A user's own /video-games/u/{username} is not a marketing surface.
  showSignupCta?: boolean;
};

export async function LibraryPage({ username, showSignupCta = false }: LibraryPageProps) {
  // Awaited first and alone: a username nobody owns must become a 404 page,
  // not the loud "the API is unwell" error that getGames() would throw for the
  // same 404. Costs one extra round trip on a cache miss.
  const profile = await getProfile(username);
  if (!profile) {
    // ...with one exception. The founder's profile is seeded, not user-created,
    // so its absence is never "no such user" — it means the API is pointed at
    // an unmigrated or unseeded database. A 404 page would quietly present that
    // as an empty site; the rest of this read path deliberately fails loudly
    // instead of rendering something wrong (see requireLibraryApiOrigin), and
    // the flagship library page is the last place to break that rule.
    if (username.toLowerCase() === LIBRARY_OWNER_USERNAME) {
      throw new Error(
        `The library API has no profile for '${LIBRARY_OWNER_USERNAME}', the seeded owner. ` +
          `That is a backend misconfiguration, not a missing user. Check that the database ` +
          `is migrated and seeded (\`cd api && uv run python scripts/seed.py\`).`
      );
    }
    notFound();
  }

  // Independent, so Promise.all runs them concurrently instead of serializing
  // the API round-trips. The follow lists ride along here rather than being
  // fetched when their tab is opened: they're public data on the same cache
  // tag, so they cost nothing after the first render and switching to the
  // Following tab needs no network at all.
  const [games, wishlist, followers, following] = await Promise.all([
    getGames(username),
    getWishlist(username),
    getFollowers(username),
    getFollowing(username),
  ]);
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
      {/* Wraps the whole page, not just the header: GameLibrary reads
          useIsOwner() from this context to decide whether to render edit
          controls. Spanning a server-rendered subtree costs nothing, because
          `children` is a serialized RSC slot rather than an import — SignupCta
          and CrtTv ship no extra JavaScript, and when `relationship` resolves
          React re-renders only the provider, since this server parent created
          the child elements. */}
      <FollowStateProvider ownerUsername={profile.username}>
        <div className="max-w-7xl mx-auto px-6 py-12">
          {/* The sign-in/out control lives here rather than the global nav: the
              portfolio has no accounts, the library is the only app that does.
              items-start keeps it aligned to the heading's first line when a
              long display name wraps. */}
          <div className="flex items-start justify-between gap-4">
            <div>
              {/* Same wording on both routes, since both show the same library.
                The display name comes from the profile rather than the URL
                segment so the casing is canonical (usernames are citext, so
                /video-games/u/RGrassian resolves to the same user as
                /video-games/u/rgrassian). */}
              {/* Follow sits with the heading because it acts on the person the
                  heading names. flex-wrap so a long display name pushes the
                  button to its own line instead of squeezing the title. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-4xl font-bold text-shelf-text">
                  {profile.displayName}&apos;s Video Game Library
                </h1>
                <FollowButton />
              </div>
              {/* Whose library this is. On /video-games/u/[username] the heading
                already carries the display name, so the handle is what adds
                information; on /video-games the heading is generic and this is
                the only thing naming the owner. Rendered from the profile, so
                the casing is the stored one rather than whatever the URL used. */}
              <p className="mt-1 text-sm text-shelf-text-muted">
                @{profile.username}
                {/* The counts are also the way into the Following/Followers
                    lists, which is why they are not tabs: those list people,
                    while the tab strip slices this library's games. Suspense
                    because the active state reads ?view via useSearchParams. */}
                {/* Counted from the lists rather than read off the profile
                    payload, which also carries followerCount/followingCount.
                    Two sources for one number can disagree, and here they
                    genuinely can: the counts come from /users/{name} while the
                    lists come from two other endpoints, and a 404 from those
                    degrades to an empty list (see fetchFollowList). That would
                    render "3 followers" above a tab saying nobody follows this
                    user. One source cannot contradict itself.
                    Revisit if these lists are ever paginated, when length stops
                    meaning total. */}
                <Suspense
                  fallback={
                    <FollowCountLinksFallback
                      followerCount={followers.length}
                      followingCount={following.length}
                    />
                  }
                >
                  <FollowCountLinks
                    followerCount={followers.length}
                    followingCount={following.length}
                  />
                </Suspense>
              </p>
            </div>
            {/* Viewer/navigation controls, as opposed to the Follow button,
                which acts on the library's owner and so sits with the heading.
                AuthButton is driven by the pre-paint flag; BackToMyLibrary
                resolves after hydration from the same context. */}
            <div className="flex items-center gap-3">
              <BackToMyLibrary />
              <AuthButton />
            </div>
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
              followers={followers}
              following={following}
            />
          </Suspense>
        </div>
      </FollowStateProvider>
    </main>
  );
}
