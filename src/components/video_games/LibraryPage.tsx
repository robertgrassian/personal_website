import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
// The stylesheets live with the component that needs them rather than in each
// route's layout: two routes render this shell now, and a per-route import
// would be two places to remember. App Router allows CSS imports from any
// component, unlike the Pages Router's global-CSS restriction.
import "@/app/video-games/video-games.css";
import "@/components/crt/crt.css";
import { getFollowers, getFollowing, getGames, getProfile, getWishlist } from "@/lib/libraryApi";
import { GameLibrary } from "@/components/video_games/GameLibrary";
import { CrtTv } from "@/components/crt/CrtTv";
import { LibraryCount, LibraryCountFallback } from "@/components/video_games/LibraryCount";
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
import { LibraryHeaderMenu } from "@/components/video_games/LibraryHeaderMenu";
import { headerMenuItemClass } from "@/components/video_games/formStyles";
import { NEW_ISSUE_URL } from "@/lib/feedback";

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
  // "This username is guaranteed to exist, so a missing profile is a bug, not a
  // 404." Only a route that hardcodes its username can know that, which is why
  // it is a prop rather than a check in here: this component's whole job is
  // "one library page, any user", and it has no business knowing which one
  // username is special. See the setter in /video-games/page.tsx.
  missingProfileIsBug?: boolean;
};

export async function LibraryPage({
  username,
  showSignupCta = false,
  missingProfileIsBug = false,
}: LibraryPageProps) {
  // Awaited first and alone: a username nobody owns must become a 404 page,
  // not the loud "the API is unwell" error that getGames() would throw for the
  // same 404. Costs one extra round trip on a cache miss.
  const profile = await getProfile(username);
  if (!profile) {
    // ...with one exception, and the caller decides whether it applies. When a
    // route pins a username it knows is seeded, a missing profile means the API
    // is pointed at an unmigrated or unseeded database. A 404 page would quietly
    // present that as an empty site; the rest of this read path deliberately
    // fails loudly instead of rendering something wrong (see
    // requireLibraryApiOrigin), and the flagship library page is the last place
    // to break that rule.
    if (missingProfileIsBug) {
      throw new Error(
        `The library API has no profile for '${username}', which the route rendering this ` +
          `page declares is seeded. That is a backend misconfiguration, not a missing user. ` +
          `Check that the database is migrated and seeded ` +
          `(\`cd api && uv run python scripts/seed.py\`).`
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
  // All in-progress games — the CRT cycles through them like TV channels. Also
  // forwarded to the stats panel, which needs them as their own list to break a
  // "Recently Played" dedup tie, not to order anything (see GameStats).
  const currentlyPlayingGames = games.filter((g) => g.currentlyPlaying);
  // `games` goes to GameLibrary whole, rated and unrated alike. It used to be
  // split on `rating !== ""` here, which left the unrated half outside the
  // filter/group/sort pipeline entirely — invisible to search, and stuck on
  // screen when a filter matched nothing. An unrated game is still a game that
  // was played, so it belongs on the shelves with the rest; `groupBy: "rating"`
  // collects them under "Unrated" (pinned last), and the rating filter has an
  // "Unrated" option for looking at just those.
  //
  // Headline count: every game in the played view, since every one of them now
  // reaches a shelf. A currently-playing game appears both here and on the CRT
  // above, which is the same double-billing a rated in-progress game has always
  // had.
  const playedCount = games.length;
  const wishlistCount = wishlist.length;

  return (
    <main className="min-h-screen bg-shelf-bg shelf-theme">
      {/* Wraps the whole page, not just the header: GameLibrary reads
          useIsLikelyOwner() from this context to decide whether to render edit
          controls. Spanning a server-rendered subtree costs nothing, because
          `children` is a serialized RSC slot rather than an import — SignupCta
          and CrtTv ship no extra JavaScript, and when `relationship` resolves
          React re-renders only the provider, since this server parent created
          the child elements. */}
      <FollowStateProvider ownerUsername={profile.username}>
        {/* py-6 on phones, the full py-12 from sm up. The library's first row
            of covers was landing just below the fold on a 390px viewport, and
            this is the cheapest 24px of the ~170 that came back. */}
        <div className="max-w-7xl mx-auto px-6 py-6 sm:py-12">
          {/* The sign-in/out control lives here rather than the global nav: the
              portfolio has no accounts, the library is the only app that does.
              items-start keeps the menu button aligned to the heading's first
              line when a long display name wraps.
              One row at every width. This used to stack into a column on
              phones, because the controls were four nowrap links that overflowed
              beside a long owner name; collapsing them into a single button
              removed the reason, and with it a whole row above the title. */}
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            {/* min-w-0 lets this shrink below its longest word, so the heading
                wraps instead of pushing the menu button off the row. */}
            <div className="min-w-0">
              {/* Same wording on both routes, since both show the same library.
                The display name comes from the profile rather than the URL
                segment so the casing is canonical (usernames are citext, so
                /video-games/u/RGrassian resolves to the same user as
                /video-games/u/rgrassian). */}
              {/* Follow sits with the heading because it acts on the person the
                  heading names. flex-wrap so a long display name pushes the
                  button to its own line instead of squeezing the title. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {/* text-xl on phones so a typical display name fits on ONE
                    line: at text-3xl "Robert's Video Game Library" needs ~430px
                    and had 342px, so every viewer paid for a second 36px line.
                    Desktop keeps text-4xl, where there was never a wrap. */}
                <h1 className="text-xl sm:text-4xl font-bold text-shelf-text break-words">
                  {profile.displayName}&apos;s Video Game Library
                </h1>
                <FollowButton />
              </div>
              {/* Whose library this is. On /video-games/u/[username] the heading
                already carries the display name, so the handle is what adds
                information; on /video-games the heading is generic and this is
                the only thing naming the owner. Rendered from the profile, so
                the casing is the stored one rather than whatever the URL used.

                One line for the whole identity block: handle, size, follow
                links. The game count used to be its own <p> below this row,
                costing a 24px line plus its mt-2 to say four words. Both
                children are inline fragments with their own separators, so
                either can render nothing without leaving a stray dot. */}
              <p className="mt-1 text-sm text-shelf-text-muted">
                @{profile.username}
                {/* useSearchParams (inside LibraryCount) requires a Suspense
                    boundary. The fallback shows the default-view count so
                    there is no flash. */}
                <Suspense fallback={<LibraryCountFallback playedCount={playedCount} />}>
                  <LibraryCount playedCount={playedCount} wishlistCount={wishlistCount} />
                </Suspense>
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
                resolves after hydration from the same context.
                Behind a menu at every width, not just on phones. Rendering the
                row and the menu side by side would put every one of these links
                in the DOM twice, which a screen reader reads as two of each
                however the breakpoint hides one. shrink-0 so the button keeps
                its width against a long heading. */}
            <div className="shrink-0">
              <LibraryHeaderMenu>
                <BackToMyLibrary />
                {/* Feedback goes here rather than in a page footer: a library is
                    long, and someone who just hit a bug is not going to scroll
                    past every shelf to report it. Plain <a>, not next/link,
                    because the target is off-site. */}
                <a
                  href={NEW_ISSUE_URL}
                  target="_blank"
                  // Without noopener the opened tab holds a window.opener handle
                  // back to this one and can navigate it elsewhere.
                  rel="noopener noreferrer"
                  className={headerMenuItemClass}
                >
                  Suggestion/Issue?
                </a>
                {/* Always rendered, hidden from signed-out visitors by CSS on the
                    pre-paint flag — the same mechanism AuthButton uses, so the
                    menu never reshuffles a beat after paint. The page itself
                    re-checks the session server-side; this flag is display only. */}
                <Link href="/video-games/account" className={headerMenuItemClass} data-hide-anon="">
                  Account
                </Link>
                <AuthButton />
              </LibraryHeaderMenu>
            </div>
          </div>
          {showSignupCta && <SignupCta />}

          {currentlyPlayingGames.length > 0 && <CrtTv games={currentlyPlayingGames} compact />}

          {/* Suspense is required because GameLibrary uses useSearchParams() */}
          <Suspense fallback={null}>
            <GameLibrary
              games={games}
              wishlist={wishlist}
              currentlyPlayingGames={currentlyPlayingGames}
              followers={followers}
              following={following}
            />
          </Suspense>
        </div>
      </FollowStateProvider>
    </main>
  );
}
