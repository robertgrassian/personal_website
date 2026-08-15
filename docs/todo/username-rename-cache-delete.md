# A username rename feature must delete `usernameByUserId` (`src/lib/meApi.ts`).

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

That module-scope map memoizes user id → username so the ten write paths don't each pay an API round
trip to learn whose cache tag to purge. It is correct only because usernames are assigned once at
onboarding and there is no rename endpoint. Add renaming without touching it and a stale entry
revalidates the _old_ username's tag — the renamed library then serves stale pages indefinitely,
with no error anywhere to explain why. There is a shouty comment on the map itself; this is the
second place to trip over it.

_The map's other constraint_ (unverified `getSession()` user id, so it is only sound behind a write
FastAPI already accepted) is documented on the map and on `revalidateMyLibrary()` in
`src/app/video-games/actions.ts` as of PR #69, so it does not need restating here. Both constraints
disappear if the memo does — dropping it costs one extra round trip per write and nothing else.
