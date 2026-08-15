# Owner edit affordances still pop in after hydration.

_Section: **Bugs** &middot; index: [`TODO.md`](../../TODO.md)_

The pencils and "Add game" appear a beat after first paint on your own library, because the answer
resolves in a `useEffect` — `useViewerRelationship`
(`src/components/video_games/useViewerRelationship.ts`), read through `useIsOwner()` in
`FollowControls.tsx`. **Premise updated 2026-08-07:** this used to name `useIsLibraryOwner` and a
`/me/profile` fetch; that hook is deleted and the two per-viewer requests are now one (see Recently
Completed). That halved the work but did not fix this — one round trip after hydration still lands
after first paint. The symptom list also lost the Unrated shelf on 2026-08-07: unrated games are no
longer `canEdit`-gated at all.

The pre-paint `data-authed` flag that fixed the CTA banner and `AuthButton` (2026-07-29; an inline
script in `src/app/layout.tsx` stamps it from the session cookie, logic in `src/lib/authFlag.ts`)
**cannot** be extended to cover this: the cookie proves a session exists but not whose it is, and
the JWT's `sub` claim is a user id, not a username, so answering "is this viewer the owner of THIS
library?" needs the `/me/relationship` round trip either way.

_Options, none free:_ have the API return the username in a separate readable cookie at sign-in
(cheap, but adds a second source of truth for identity that can go stale after a rename); or accept
the pop-in and make it less jarring by reserving space so nothing shifts. Lower priority than the
two already fixed: this one only affects a viewer looking at their own library, who is about to
interact with the page anyway.
