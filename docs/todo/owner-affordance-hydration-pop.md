# Owner edit affordances still pop in after hydration.

_Section: **Bugs** &middot; index: [`TODO.md`](../../TODO.md)_

The pencils and "Add game" appear a beat after first paint on your own library, because the answer
resolves in a `useEffect` — `useViewerRelationship`
(`src/components/video_games/useViewerRelationship.ts`), read through `useIsOwner()` in
`FollowControls.tsx`. **Premise updated 2026-08-07:** this used to name `useIsLibraryOwner` and a
`/me/profile` fetch; that hook is deleted and the two per-viewer requests are now one.
That halved the work but did not fix this — one round trip after hydration still lands
after first paint. The symptom list also lost the Unrated shelf on 2026-08-07: unrated games are no
longer `canEdit`-gated at all.

**Narrowed 2026-08-19: the network wait is gone; the first-paint gap is not.**
`src/lib/ownedLibrary.ts` caches the confirmed "this library is mine" answer in localStorage, and
`useViewerRelationship` now seeds `"me"` from it before awaiting anything, so on a repeat visit the
affordances render at hydration instead of one round trip later. Measured against a stub API with a
600ms `/me/relationship`: cold cache +1045ms, warm cache +426ms, the difference being the whole
round trip. The remaining delay is hydration itself.

_What is left, and the one thing that would close it._ First paint is server HTML, so nothing
client-side can reach it — only the pre-paint inline script in `src/app/layout.tsx` can. Extending
it needs the page to carry something the script can compare the viewer against, and the viewer's
username is not in the session cookie: the JWT's `sub` is a user id. Two ways in, both a real
decision rather than a tweak:

- **Put the owner's auth user id in the public profile payload** and have the script compare it to
  `sub`. Exact and never stale (ids do not change), but it publishes a user id on a cached page for
  every viewer, and it means parsing Supabase's cookie _value_ format in the inline script — a
  deeper coupling than the key derivation `authFlag.ts` already flags as one, though it fails closed.
- **Stamp `data-owner` from the localStorage entry above**, comparing against the owner username the
  route already carries. No new public data, but the affordances would have to ship in the HTML for
  every viewer and be hidden in CSS (the `data-hide-authed` pattern), which puts a pencil button in
  the DOM of every card for visitors who will never use one.

_Known cost of the cache, accepted._ A stale entry (today only a rename, which does not exist yet)
shows the controls for the length of one round trip before the API takes them away, verified: they
appear at hydration, disappear when `isMe: false` lands, and the entry is cleared. Cosmetic, but
"the server re-checks ownership" is not the reason: `PATCH`/`DELETE /me/games/{id}` do 404 on
someone else's row, while `POST /me/games` has no row to check and always writes to the CALLER's
library. That split is now in the hook names: `useIsLikelyOwner` includes the guess and drives the
pencils and the copy, `useIsConfirmedOwner` waits for the API and drives everything that creates a
row. Measured with a 600ms stub: pencils at +586ms, "+ Add game" at +1112ms, and on a stale cache
the add affordance never appears at all. The entry also carries the user id that earned it, so
switching accounts (which fires `SIGNED_IN`, never a sign-out) drops it.

_Still true._ This only affects a viewer looking at their own library, who is about to interact with
the page anyway.
