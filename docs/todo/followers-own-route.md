# Move the Following/Followers tabs to their own route.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

The honest altitude answer that the `GameShelves` extraction deliberately did not take: the follow
lists are a different _page_, not a different tab.

`/video-games/u/[username]/followers` would match the "library owns the prefix" convention, let
`PeopleList` stay a server component, and stop the follow graph crossing the client boundary on
every library render. `LibraryPage` currently fetches `getFollowers` and `getFollowing` on every
load and threads both through `GameLibrary`.

_Why it is not a cleanup._ It is a routing change. Existing `?view=followers` and `?view=following`
URLs need redirects, `LibraryPage`'s five-way `Promise.all` fan-out changes shape, and the tab strip
in `GameLibrary` has to decide whether those two tabs become links rather than `setView` buttons.
