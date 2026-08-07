# Game library simplification backlog

Recommendations from a `/simplify` review of the instanced-library work
(commits `76895d9..5e3305e`, Milestone 1 through the IGDB search improvements)
that were **reviewed but not applied**. Four commits' worth were applied on
branch `claude/game-library-simplify-chau4b`; everything below is what is left.

## Provenance

Twelve review agents ran across three scopes, four angles each (reuse,
simplification, efficiency, altitude):

| Group | Scope                                                               |
| ----- | ------------------------------------------------------------------- |
| 1     | `src/lib/**`, `src/app/video-games/actions.ts`, `src/middleware.ts` |
| 2     | `src/components/video_games/**`, `/video-games` pages, `AuthButton` |
| 3     | `api/app/**`                                                        |

Where several agents independently reached the same finding it is marked
**(consensus)**. Those are the ones to trust most: they were found from
different angles without shared context.

## How to use this

Each item is self-contained: what is wrong, where, the fix, how to verify, and
the risk. They are grouped into tiers that make reasonable PR boundaries. Within
a tier, items are ordered so earlier ones do not conflict with later ones.

**Line numbers are as of commit `922e41f`** and drift. Symbol names and file
paths are the reliable anchors; grep for those.

Two dependencies worth knowing before you start:

- **T1.1 (delete `useIsLibraryOwner`) should land before T3.2 (split
  `GameLibrary`)** — both reshape the same props, and doing them in the other
  order means doing the second one twice.
- **T2.4 (`useServerAction`) touches all three modals**, which T3.1 (split
  `AddGameModal`) also does. Either order works, but not in parallel.

## Verifying your work

```bash
npm run lint
npx tsc --noEmit      # one pre-existing error in src/app/page.tsx, see below
cd api && uv run ruff check . && uv run ruff format --check .
```

`npx tsc --noEmit` reports one error that is **not yours**:

```
src/app/page.tsx(5,28): error TS2307: Cannot find module '../../public/images/san-pedro-cliffs.jpeg'
```

It needs the generated `next-env.d.ts`, which only appears after a `next dev` or
`next build`. It is present on `main` too. Filter it out; do not "fix" it.

### Running the Python suite for real

`uv run pytest` alone **skips 173 tests** ("DATABASE_URL not set") — including
every API test that exercises status codes, which is most of what group 3
touches. A green run without a database proves very little.

Standing up a throwaway Postgres 16 (present in the container, but `initdb`
refuses to run as root, and the migrations expect Supabase's `auth.users`):

```bash
export PATH=$PATH:/usr/lib/postgresql/16/bin
PGROOT=/var/tmp/pgtest; rm -rf $PGROOT; mkdir -p $PGROOT; chown postgres:postgres $PGROOT
su postgres -c "PATH=\$PATH:/usr/lib/postgresql/16/bin initdb -D $PGROOT/data -U postgres --auth=trust"
su postgres -c "PATH=\$PATH:/usr/lib/postgresql/16/bin pg_ctl -D $PGROOT/data -o '-p 55432 -k $PGROOT' -l $PGROOT/log start"

psql -h $PGROOT -p 55432 -U postgres -c "CREATE DATABASE gamelib;"
psql -h $PGROOT -p 55432 -U postgres -d gamelib -c "CREATE EXTENSION IF NOT EXISTS citext;"

# Supabase owns auth.users in production; the test fixtures insert into it directly.
psql -h $PGROOT -p 55432 -U postgres -d gamelib <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
  instance_id uuid, id uuid PRIMARY KEY, aud varchar(255), role varchar(255),
  email varchar(255), encrypted_password varchar(255),
  created_at timestamptz, updated_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  email_confirmed_at timestamptz, last_sign_in_at timestamptz,
  confirmation_token varchar(255), recovery_token varchar(255),
  email_change_token_new varchar(255), email_change varchar(255),
  is_super_admin boolean, phone text
);
SQL

export DATABASE_URL="postgresql+psycopg://postgres@/gamelib?host=$PGROOT&port=55432"
export MAX_USERS=100000   # else accumulated test profiles trip the signup cap
cd api && uv run alembic upgrade head && uv run pytest -q
```

**Expected: `340 passed, 9 failed`.** The 9 failures are pre-existing and
environmental — they need seeded fixture data (`uv run python scripts/seed.py`)
that a bare database does not have. They are in `test_users_api.py` and one in
`test_me_api.py`, all named for seeded content (`..._returns_seeded_owner`,
`..._returns_full_library...`).

**Always capture a baseline before judging your own run**, since that 9 is
environment-dependent:

```bash
git stash -u && uv run pytest -q 2>&1 | tail -3   # baseline
git stash pop && uv run pytest -q 2>&1 | tail -3  # yours — compare counts AND names
```

Between runs, reset accumulated rows:

```bash
psql -h $PGROOT -p 55432 -U postgres -d gamelib -c "TRUNCATE profiles CASCADE; DELETE FROM auth.users;"
```

## Project conventions that bite

From `.claude/CLAUDE.md`, and each has already caused a real defect here:

- **No em dashes in user-facing text.** JSX copy, `aria-label`, `alt`,
  metadata, **error message strings**. The applied work found one in a
  rate-limit message in `meApi.ts`. Code comments and `docs/*.md` are exempt.
- **Light and dark mode both, always.** Never add a color class that only works
  in one. Centralizing class strings (T2.3) is partly a defense against this.
- **Never touch `TODO.md` without the `proj-todo` skill** — including reading it.
- **No Claude/Anthropic attribution in commit messages.**
- **Teaching comes first.** This repo exists to learn frontend. Explain what you
  changed and why in the PR body and in comments; prefer a comment that says
  _why_ over one that restates the code. Match the existing density, which is
  high and deliberate.

---

# Tier 1 — highest payoff

## T1.1 Delete `useIsLibraryOwner`; hoist the provider **(consensus: 4 agents)**

**Files:** `src/components/video_games/useIsLibraryOwner.ts` (delete),
`LibraryPage.tsx`, `GameLibrary.tsx`, `FollowControls.tsx`

**Problem.** Two hooks ask the same question with two separate authenticated
round trips. `useViewerRelationship` calls `GET /api/py/me/relationship/{owner}`;
`useIsLibraryOwner` calls `GET /api/py/me/profile` and string-compares usernames
to derive a boolean the first response **already contains** as `isMe`.

The backend says so explicitly. `api/app/schemas/me.py` documents `is_me` as
folded into `RelationshipRead` precisely so the UI can settle "hide entirely" vs
"show Follow" _"from a single request instead of racing two."_ The UI races two
anyway.

Cost per signed-in page view: one redundant round trip, one redundant
`getSession()`, one extra `createBrowserClient()`, and ~76 lines that duplicate
`useViewerRelationship`'s reset/cancel/lowercase machinery — including the
comment blocks, which cross-reference each other as "same constraint, same
shape". Two implementations of one subtle invariant is one too many.

There is also a visible symptom: the two answers land independently, so edit
pencils can appear while the Follow button is still deciding.

**Fix.**

1. In `LibraryPage.tsx`, move `<FollowStateProvider ownerUsername={profile.username}>`
   up to wrap the whole `max-w-7xl` div rather than just the header, so
   `GameLibrary` sits inside it. Its closing tag moves down accordingly.
2. Export a selector from `FollowControls.tsx`:
   `export function useIsOwner() { return useContext(FollowStateContext)?.relationship === "me"; }`
3. `GameLibrary.tsx`: `const canEdit = useIsOwner();`, and drop the
   `ownerUsername` prop (it existed only to feed the deleted hook).
4. Delete `useIsLibraryOwner.ts`.

**Server/client boundary: nothing gets worse.** `FollowStateProvider` is already
`"use client"` and already wraps server-rendered markup. Widening it pulls
nothing extra into the bundle, because `children` is a serialized RSC slot, not
an import — `SignupCta` stays a server component shipping zero JS. It also costs
no re-renders: the children elements are created by the server parent, so when
`relationship` resolves React re-renders the provider only, not the subtree.

**Behavioral parity.** `/me/relationship/{username}` returns 403 for a
not-onboarded caller and 404 for an unknown username; `useViewerRelationship`
leaves `relationship` at `"unknown"` on any `!res.ok`, so `canEdit` is false —
matching today's "any failure means no edit controls". The reset-on-navigate
guard already exists in `useViewerRelationship`. The lowercase compare is not
lost: `LibraryPage` passes the canonical `profile.username` and the endpoint
resolves by citext.

**Tradeoff to state in the PR.** Edit controls come to depend on the follow
endpoint rather than the profile endpoint. That is one endpoint either way, and
today's split already produces an incoherent header when one succeeds and the
other fails.

**Verify.** Sign in as the library owner: pencils appear on cases, the Unrated
shelf renders, no Follow button. View another user's library: Follow button
appears, no pencils. Signed out: neither. Confirm in devtools that only **one**
`/api/py/me/*` request fires per page load.

**Risk:** low-medium. Four files, one deleted, no backend change.

## T1.2 Narrow the cache tags **(consensus: 2 agents, plus 2 group-3 agents traced the downstream cost)**

**Files:** `src/lib/libraryApi.ts`, `src/app/video-games/actions.ts`,
`src/app/onboarding/actions.ts`

**Problem.** `libraryCacheTag(username)` is the _only_ tag on all five public
reads: games, wishlist, followers, following, profile. Every mutation calls
`revalidateMyLibrary()`, which purges it, and the Server Action response
re-renders the page — so **one rating edit refetches all five endpoints.**

Rating ten games in a sitting costs ~50 API round trips where ~10 would do. A
follow toggle purges the full tag on _both_ users, so 4 of the 10 resulting
fetches (games + wishlist × 2) cannot possibly have changed. The group-3 review
measured the far end of this: those five endpoints are ~12 Postgres queries, two
of which are provably dead (see T2.7).

**Fix.** Next supports multiple tags per entry. Keep the umbrella tag (so a
"purge everything for this user" escape hatch survives) and add resource tags:

```ts
export const libraryCacheTag = (u: string) => `library:${u.toLowerCase()}`;
export const gamesTag = (u: string) => `library:${u.toLowerCase()}:games`;
export const wishlistTag = (u: string) => `library:${u.toLowerCase()}:wishlist`;
export const followsTag = (u: string) => `library:${u.toLowerCase()}:follows`;
```

Tag each fetch with `[libraryCacheTag(u), <its own tag>]`. `fetchUserResource`
already centralizes tagging, so this is one call site plus a per-resource
argument. Then in `actions.ts`:

| Write                               | Revalidate                                    |
| ----------------------------------- | --------------------------------------------- |
| add / delete game, rating, sessions | `gamesTag(me)`                                |
| wishlist add / update / delete      | `wishlistTag(me)`                             |
| wishlist **promote**                | `gamesTag(me)` **and** `wishlistTag(me)`      |
| follow / unfollow                   | `followsTag(me)` **and** `followsTag(target)` |

The profile read carries `followerCount`/`followingCount`, so tag it
`followsTag` as well as the umbrella.

**Why this was not done in the applied pass.** Getting it wrong means a stale
page, which is worse than the waste it fixes. It needs the table above checked
against every action, and promote is the one that is easy to get wrong: it
moves a row _between_ two resources, so it must purge both.

**Verify.** Rate a game with the network tab open: exactly one library endpoint
should refetch, not five. Then explicitly test promote (wishlist row disappears
_and_ game appears) and follow (both users' counts update).

**Risk:** medium. Low code risk, real logic risk. Enumerate every action.

## T1.3 Stop running Supabase middleware on `/api/py/*`

**File:** `src/middleware.ts`

**Problem.** The matcher excludes static assets but still matches
`/api/py/:path*`, which `next.config.ts` rewrites to FastAPI. So every browser
call to the API runs `updateSession()` → `supabase.auth.getUser()`, a **network
round trip to Supabase Auth**, before the rewrite proxies.

Those API calls authenticate with an explicit `Authorization: Bearer` header
that FastAPI verifies via JWKS. The cookie refresh does nothing for them. For a
signed-in viewer loading a library page today that is 3 `getUser()` calls
(document + `/me/profile` + `/me/relationship`) where 1 is needed. RSC prefetches
on hover pay it too. **T1.1 removes one of those; this removes the rest.**

**Fix.** Add `api/py` to the negative lookahead:

```ts
matcher: [
  "/((?!api/py|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
],
```

**Verify.** Sign in, confirm session refresh still works across navigations and
after a token expiry, and that `/api/py/me/*` calls still authenticate (they use
the Bearer header, so they should be untouched).

**Risk:** low. Update the matcher comment to say why the API path is excluded.

**Optional follow-on, needs checking first:** `supabase.auth.getClaims()`
(supabase-js ≥ 2.110) verifies the JWT locally against cached JWKS instead of
calling `/auth/v1/user`, removing the round trip from the remaining page
requests. Only works if the project's Supabase JWT signing keys are asymmetric;
with a legacy HS256 secret it silently falls back to a network call. Confirm the
key type before bothering.

## T1.4 `WRITE_GUARDS` constant **(consensus: 2 agents)**

**Files:** `api/app/core/guards.py`, `api/app/routers/me.py`

**Problem.** `dependencies=[Depends(forbid_in_preview), Depends(rate_limit_writes)]`
is spelled out verbatim on **12 routes**. Coverage depends on a human
remembering two `Depends` on every new mutating route; omit them and the
endpoint is unlimited and writable on preview, with nothing failing.

**Fix (cheap version).** In `guards.py`:

```python
WRITE_GUARDS = [Depends(forbid_in_preview), Depends(rate_limit_writes)]
```

and use `dependencies=WRITE_GUARDS` at the 12 sites. One name, twelve uses,
still visible in each decorator — which was the stated reason for the current
shape, and it survives.

**Fix (deeper version, optional).** Split `/me` into a read router and
`APIRouter(dependencies=WRITE_GUARDS)` for the mutating routes, so membership in
the write router _is_ the guard. Worth it only if you are reshaping the router
anyway. Note `routers/igdb.py` and `routers/genres.py` are deliberate explicit
opt-ins (write-through GETs) and should stay explicit either way.

**Verify.** `test_me_api.py` has preview-refusal and rate-limit tests covering
these routes. Run the suite per the setup above.

**Risk:** trivial.

---

# Tier 2 — worthwhile and mechanical

## T2.1 Shared client-side `/me` fetch helper

**Files:** new `src/lib/meApiClient.ts` (or `src/components/video_games/useMeQuery.ts`),
`useViewerRelationship.ts`

After T1.1, `useViewerRelationship` is the **last** hand-rolled browser-side
`session → Bearer → /api/py/me/*` call. `src/lib/meApi.ts` is the server-side
counterpart and is `server-only`, so it cannot be reused here.

With one remaining call site this is **not urgent** — it becomes worth doing the
moment a second one appears. Noted so the next person adding a per-viewer read
writes the helper instead of a third copy.

Related, from the group-2 efficiency review: `src/lib/supabase/client.ts`
returns a fresh `createBrowserClient()` on every call, and there are two callers
per page (`AuthButton`, the provider). Each duplicate GoTrue instance carries its
own storage listener and refresh scheduler. A module-level singleton there is a
small, safe win.

## T2.2 `RatingPicker` component **(consensus: 2 agents)**

**Files:** new `src/components/video_games/RatingPicker.tsx`,
`AddGameModal.tsx`, `EditGameModal.tsx` (twice)

Three hand-rolled `grid grid-cols-5` + `RATINGS.map` grids, ~69 lines. All three
share the grid classes, the loop keyed on `r.letter`, the
`"Rate {name}"`/`"Remove rating"` title/aria pair, and the
`style={active ? { backgroundColor: r.color } : { color: r.color }}` trick
(inline because rating colors are CSS vars, not Tailwind classes).

Differences are cosmetic: letter-only vs letter+name, and whether clicking an
already-active rating clears it.

```tsx
<RatingPicker value={rating} onPick={rate} variant="compact" | "labeled" disabled={isPending} />
```

The existing `RatingIndicator` / `RatingBadge` / `RatingRibbon` are
non-interactive shelf badges and do **not** cover this — checked.

## T2.3 Button recipes into `formStyles.ts`

**Files:** `formStyles.ts`, then ~22 call sites across `EditGameModal`,
`EditWishlistModal`, `AddGameModal`, `GameLibrary`, `FollowControls`,
`SignupCta`, `start/SignInPanel`

Four recipes, re-typed as long literals:

- **outline/secondary** (~138 chars) — **9 copies**
- **ghost/underline** — **7 copies**
- **destructive** — 2 filled + 2 link
- **accent/primary** — 4 copies, each with its own comment re-explaining why
  `bg-link` + `text-background` is the light/dark-safe pairing

Add `buttonClass`, `ghostButtonClass`, `dangerButtonClass`, `dangerLinkClass`,
`accentButtonClass`. Call sites keep only positional modifiers (`mt-2`, `block`).

Centralizing is what stops the next copy from getting dark mode wrong — the
recurring failure this repo's conventions guard against.

A fifth accent-button copy lives at `src/app/onboarding/OnboardingForm.tsx`,
outside the reviewed scope. Point it at the same constant while you are there.

## T2.4 `useServerAction` hook

**Files:** new `src/components/video_games/useServerAction.ts`, then
`EditGameModal` (5), `EditWishlistModal` (4), `AddGameModal` (1),
`FollowControls` (1)

Eleven copies of:

```ts
startTransition(async () => {
  setError(null);
  const result = await someAction(...);
  if (!result.ok) setError(result.message);   // sometimes: if (ok) onClose();
});
```

plus the identical `useTransition()` + `useState<string | null>(null)` pair
declared in four files. ~55 lines.

```ts
const { isPending, error, setError, run } = useServerAction();
run(() => deleteGame(id), { onSuccess: onClose });
```

`ModalShell` (already shipped) takes `error` directly from it. `FollowControls`
does a manual optimistic revert, so `run` must expose the result.

## T2.5 `ConfirmStep` component

**Files:** `EditGameModal.tsx`, `EditWishlistModal.tsx`

Two copies of the same `!deleteStep ? <red link> : <prompt + Remove/Cancel>`
structure with identical class strings, differing only in prompt text and the
session-count sentence.

```tsx
<ConfirmStep triggerLabel="Remove from library" prompt={...} confirmLabel="Remove"
             onConfirm={removeGame} disabled={isPending} />
```

## T2.6 `StatsPanel` re-implements `useModalChrome`

**File:** `src/components/video_games/StatsPanel.tsx`

~30 lines — the latest-ref `onCloseRef` pattern, `previousOverflow` save/restore,
`closeButtonRef.current?.focus()`, the keydown listener and cleanup — duplicating
`useModalChrome` in the same order, comments included. It was never converted
because it cannot go mount-only: it slide-animates via `translate-x-full` and
stays mounted while closed.

**Fix.** Give `useModalChrome` an optional third parameter `enabled = true` and
call `useModalChrome(onClose, closeButtonRef, isOpen)`.

**Flag the behavior delta explicitly:** the shared hook also restores focus to
the opener on close, which `StatsPanel` currently does not do. That is an
improvement, but make it a deliberate choice rather than a surprise.

## T2.7 Drop the dead follower/following counts **(consensus: 3 agents)**

**Files:** `api/app/services/users.py`, `api/app/repositories/users.py`,
`api/app/schemas/users.py`, `src/lib/profile.ts`, and three test files

**Problem.** `get_user_profile` runs `count_followers` and `count_following` on
every call — 2 of its 3 queries. **Nothing reads them.** `LibraryPage` renders
`followers.length` / `following.length` and documents why: two sources for one
number can disagree, and here they genuinely can, because the counts come from
`/users/{name}` while the lists come from two other endpoints whose 404 degrades
to an empty list. That would render "3 followers" above a tab saying nobody
follows this user.

Verified: no reader in `src/**`, none in `api/app/**` outside
`get_user_profile`. Only assertions in `test_users_api.py` and
`test_follows_api.py`.

Because the profile shares the library cache tag, this is paid again on **every
write** (until T1.2 lands).

**Two options — this needs a human decision.**

- **(a) Delete the fields.** Honest: the frontend has deliberately chosen never
  to trust them, so they are surface that looks authoritative but must not be
  used. Removes `count_followers`/`count_following` from the repository, the two
  fields from `ProfileRead` and from `LibraryProfile` in `src/lib/profile.ts`,
  and updates the three test files.
- **(b) Keep the wire contract, drop the round trips.** Compute both as scalar
  subqueries in the existing profile SELECT. One query instead of three, no
  contract change, no test churn.

**(b) is the safer default** if there is any chance a future surface wants
counts without fetching lists (a user search result row, say). **(a) is what
three agents recommended.** Pick one deliberately; do not do half of each.

## T2.8 `close_my_session` fetches the game twice **(consensus: 2 agents)**

**Files:** `api/app/services/me.py`, `api/app/repositories/me.py`

`get_session_for_owner` already does `select(PlaySession).join(Game, ...)` to
prove ownership — the Game row is read by the database and discarded. Three
lines later `get_game_for_owner` fetches it again by id. The service even
carries a four-line comment explaining why the redundant fetch is there, which
is itself the tell that the seam is wrong.

**Fix.** Return the pair: `select(PlaySession, Game).join(...).first()`. Or
declare the `PlaySession.game` relationship on the model and use `joinedload`.
The comment deletes itself with the query.

Under `NullPool` this also saves a full connect + TLS handshake, not just a
round trip (see T3.6).

## T2.9 One `MAX_GENRES`, one number

**Files:** `api/app/schemas/me.py`, `api/app/services/genres.py`,
`api/app/models/game.py`

The same rule is expressed three times at three altitudes **with two different
numbers**: `MAX_GENRES = 12` in `clean_genres`, `Field(max_length=10)` on the
two create schemas, and another `MAX_GENRES = 12` in `services/genres.py`.

Pydantic applies `max_length=10` _before_ the validator, so the effective cap
over HTTP is **10** and the 12 never fires there — it applies only to the
backfill path. So "what is the limit" depends on which door you came in.

**Fix.** One constant next to `RATING_NAMES` in `app/models/game.py` — already
the established home for a shared vocabulary rule, and `RATING_CHECK_SQL` exists
there for exactly this anti-drift reason. Import it in both places, drop the
literal `max_length` on the list (or set it from the constant), and pick a
number.

**Check first** whether a test asserts that an 11-genre payload is a 422; the
effective cap changes if you standardize on 12.

## T2.10 Small leftovers

- **`authFlag.ts`:** `AUTHED_ATTR` and `sessionCookieKey` are `export`ed but
  referenced only within the file (`globals.css` hardcodes the literal, as its
  own comment says). Dropping `export` makes the "grep, don't rename" warning
  accurate about the real surface.
- **`GameLibrary.tsx`:** `unratedGames?`, `followers?`, `following?` are
  optional with `= []` defaults and a comment reading "Defaults to [] for
  callers that predate it." There is exactly one caller and it passes all three,
  so the comment is false and the defaults hide a missing prop. Make them
  required. (Folds naturally into T3.2.)
- **`GameLibrary.tsx` empty state:** a four-deep nested ternary picks between
  four sentences differing in two words. Two locals
  (`const subject = view === "played" ? "library" : "wishlist"`) collapse nine
  lines to one and keep the branches provably in sync.
- **Twin `FilterBar` call sites:** the played and wishlist invocations share
  nine identical props written out twice. Hoist into one `filterBarCommon`
  object and spread. The discriminated union still narrows, because `view`
  stays a literal at each site.
- **`api/app/services/users.py`:** comments describe `derive_play_state` as "a
  direct port of `derivePlayState()` in `src/lib/gamesServer.ts`". That file no
  longer exists — deleted in the applied pass. Comment-only.
- **`api/app/core/supabase_admin.py`:** `delete_auth_user` returns a `bool` that
  `services/me.py` discards. One line; fold in if you are already in the file.

---

# Tier 3 — larger restructures

Real wins, but each is a day-shaped change rather than a cleanup. Do them one
PR at a time.

## T3.1 Split `AddGameModal` (574 lines) into two components

**File:** `src/components/video_games/AddGameModal.tsx`

The search step and the confirm step share **no state and no handlers**, and the
split is already visible in the JSX as `draft === null ? ... : ...`. But seven
search state slots (`query`, `results`, `searching`, `searchError`, `page`,
`hasMore`, `loadingMore`) plus a `searchSeq` ref stay alive and re-render with
every keystroke in the form; symmetrically `genreLookup`/`genreSeq` are dead
during search.

**Fix.** `GameSearchStep({ initialQuery, onPick, onManual })` and
`GameDraftForm({ target, draft, setDraft, existingSystems, onBack, onSave })`.
`AddGameModal` shrinks to the shell plus `useState<Draft | null>`. Search state
unmounts on hand-off, which also removes the need to reason about a stale
in-flight search while the user types genres.

## T3.2 Split `GameLibrary` (397 lines) **(consensus: 2 agents)**

**File:** `src/components/video_games/GameLibrary.tsx`

It renders two unrelated screens. The people tabs share nothing with the shelf
pipeline except a `?view` value, yet eight `useMemo`s and the whole
filter/group/sort machinery are declared on a tab that lists usernames — the
pipeline memo needs an explicit `if (!isGameView(view)) return []` bail purely
to opt out of itself. `followers`/`following` are threaded through solely to
reach `PeopleList`; `currentlyPlayingGames` solely to reach `StatsPanel`.

**Fix, in descending payoff:**

1. Move the option lists and "available" sets into `pipeline.ts` or a
   `useFilterOptions(games, wishlist, filters)` hook. Pure lift, do this first.
2. Extract `GameShelves` taking
   `{ games, wishlist, unratedGames, currentlyPlayingGames, canEdit, urlState }`.
   `GameLibrary` becomes tab strip + view routing + modal host, ~100 lines.
3. Collapse the twin `FilterBar` calls (also T2.10).

**Do T1.1 first** — it removes `ownerUsername` and reshapes the same props.

**Noted but not recommended now:** the honest altitude answer is that the people
tabs are a different _page_, not a different tab. `/video-games/u/[username]/followers`
would match the "library owns the prefix" convention, let `PeopleList` stay a
server component, and stop the follow lists crossing the client boundary on
every library render. That is a routing change, not a cleanup.

## T3.3 Edit permission via context, not callback presence

**Files:** `ShelfSection.tsx`, `GameCase.tsx`, `GameLibrary.tsx`

"May this viewer edit?" travels as an optional `onEditGame`/`onEdit` prop, and
`GameCase` re-derives permission from prop presence
(`editable = onEdit !== undefined && game.id !== undefined`). The rule ends up
expressed in three places, and `ShelfSection` — otherwise purely presentational
— must carry an editing prop through to every card.

**Fix.** After T1.1, add a small `LibraryEditingContext` provided by
`GameLibrary` exposing `openEditor: ((game: GameCaseInput) => void) | null`,
null when not the owner. `ShelfSection` loses the prop; `GameCase` renders the
pencil iff `openEditor !== null && game.id !== undefined`.

It must be provided by `GameLibrary`, not `LibraryPage`, because the handler is
view-aware (it picks `EditGameModal` vs `EditWishlistModal`).

## T3.4 Move the founder special case out of the shared shell

**Files:** `LibraryPage.tsx`, `src/app/video-games/page.tsx`, `src/lib/games.ts`

`LibraryPage` — the component whose entire purpose is "one library page, any
user" — imports `LIBRARY_OWNER_USERNAME` to decide whether a missing profile is
a 404 or a loud misconfiguration. Every render of every stranger's library
evaluates a branch that can only fire for one username.

The reasoning behind the branch is sound (a missing founder profile means an
unmigrated database, and rendering that as an empty 404 page would hide a real
misconfiguration). The _altitude_ is wrong.

**Fix.** Hoist the decision to the route that knows it is pinned: `LibraryPage`
takes `missingProfileIsBug?: boolean` alongside the existing `showSignupCta`;
`/video-games/page.tsx` sets it, `/video-games/u/[username]` never can. The
throw message interpolates `username` instead of the constant, and `LibraryPage`
stops importing from `@/lib/games`.

## T3.5 The `CurrentProfile` dependency

**Files:** `api/app/core/auth.py` (or new `core/deps.py`), `services/me.py`,
`services/follows.py`, `routers/me.py`

The auth dependency stops at the auth-user UUID, so every route needing a
_profile_ re-asks `me_repo.get_profile_by_id` by hand — six call sites. Worse,
it forces a service-to-service import: `services/follows.py` imports
`OnboardingRequiredError` from `services/me.py`, so the follow domain depends on
the `/me` domain for its own precondition. Nothing else in the layout does that.

The check is also easy to omit silently. `create_my_game` and
`create_my_wishlist_item` do it; the session and wishlist-edit paths rely on the
ownership `WHERE` happening to imply it. True today, but the invariant lives in
a comment, not a type.

**Fix.** `get_current_profile` beside `get_current_user`, yielding
`CurrentProfile = Annotated[Profile, Depends(get_current_profile)]` that 403s
when no profile row exists. Every `/me` route except `POST`/`GET /me/profile`
takes it. Services change from `user: AuthenticatedUser` to `profile: Profile`
(same UUID, so bodies barely change). `OnboardingRequiredError` moves to
`core/errors.py`, breaking the `follows → me` import.

Also saves a query per request on paths that currently load the profile _and_
the game.

**Cost to weigh:** the per-action wording ("adding games" vs "following
people") is lost unless you parameterize the dependency. Either parameterize it
or accept one generic sentence — decide deliberately, it is user-facing copy.

~13 handler signatures, ~10 service signatures.

## T3.6 The three-connections-per-write problem

**Files:** `api/app/core/db.py`, `api/app/core/guards.py`,
`api/app/repositories/rate_limit.py`

Measured, not theorized. `NullPool` closes the connection when the Session
releases it, and every `commit()` releases it — so multiple commits per request
mean multiple **physical connects**. For `PATCH /me/games/{id}`:

```
after rate-limit commit:          1 connection
after update_game_rating commit:  2 connections
after db.refresh(game):           3 connections
```

From a Vercel function that is roughly 20-100 ms of pure TCP + TLS + auth
handshake on a request whose real work is one `UPDATE`.

The applied pass removed the third by dropping the redundant `db.refresh()`.
The remaining one is `rate_limit_writes` committing separately
(`repositories/rate_limit.py`). Folding the counter increment into the handler's
transaction would remove it — **but that is a deliberate design call**: the
charge is committed separately precisely so it survives a handler that raises.
Fold it in and a failed write stops counting against the budget, which is a
rate-limit bypass.

**Do not change this silently.** It needs a decision about whether failed writes
should be charged. The `NullPool` choice itself is correct and well argued in
its docstring; the problem is transactions per request, not the pool.

## T3.7 Split `services/genres.py` (629 lines) **(consensus: 3 agents)**

**File:** `api/app/services/genres.py`

Three concerns in one module: pure vocabulary/normalization (~lines 43-249), a
Wikipedia/Wikidata HTTP client plus wikitext parsing (~272-603), and about 16
lines that are actually a service. The `Session` import sits on a module that is
97% offline string processing.

The tell: `scripts/backfill_genres.py` imports the module wholesale and reaches
into a private (`genre_service._title_similarity`). A script importing a
_service_ to get at pure functions means the pure functions want their own home.

**Fix.** `app/services/genre_vocab.py` (tables + `normalize_genre(s)` +
`_title_case`, zero imports beyond `re`), `app/clients/wikipedia.py` (the `_get`
seam, `search_candidates`, `lead_sections`, `parse_infobox_genres`,
`genres_for_qids`, `title_similarity` made public), leaving `services/genres.py`
as `lookup_for_user` plus rate-limit constants.

`services/igdb.py` (418 lines) has the identical shape and the same fix.

**Why it was deferred:** import churn across `test_genres.py` (649 lines),
`test_genre_cleaning.py`, `test_igdb_api.py`, and two scripts. No behavior
change, but a day of moving. If you want only the smallest useful slice, extract
the vocabulary half — that is what the scripts actually reach for.

## T3.8 Per-keystroke render work

**Files:** `pipeline.ts`, `GameLibrary.tsx`, `ShelfSection.tsx`, `GameCase.tsx`

Measured against the seeded library (~155 games, ~29 wishlist rows). The applied
pass already fixed the largest item here (memo identity in
`useGameLibraryUrlState`), which was causing the entire pipeline to run twice
per settled search. What remains:

- **Two wasted passes per keystroke.** The two wishlist "available" memos run in
  the played view and vice versa, because `activeWishlistFilters` also carries
  `searchInput`. Gate by view.
- **Three passes that should be one.** `availableRatings`, `availableSystems`,
  `availableGenres` are three full `filterGames` scans. Evaluate the four
  predicate components once per game and populate all three sets in one
  traversal: 4 evaluations per game over 1 pass instead of 9 over 3.
- **`filters.search.toLowerCase()` per game.** In `pipeline.ts:27`, inside the
  filter callback — ~465 redundant lowercasings of the _query_ per keystroke.
  Hoist to a `const needle` before the `.filter()`.
- **Every visible `GameCase` re-renders per keystroke.** `ShelfSection`
  allocates a fresh `() => onEditGame(game)` per game per render and `GameCase`
  is unmemoized, so ~155 cases (~1,500 elements) reconcile to change nothing.
  Change `GameCase`'s prop to `onEdit?: (game) => void` so it calls with its own
  game, `useCallback` the handler, and wrap `GameCase` in `React.memo`. Game
  object identity is already stable, so memo bites. **T3.3 supersedes this** —
  do that instead if you are doing both.
- **`localeCompare` on ISO dates.** Six sort branches use full ICU collation to
  order `"2023-05-12"`-shaped fixed-width ASCII, where `<` is equivalent and
  ~10× cheaper per comparison. For the genuinely locale-sensitive name sorts,
  hoist a module-level `const collator = new Intl.Collator()` and use
  `collator.compare` — same semantics, collator resolved once. Same pattern in
  `GameStats.tsx`.
- **Three array scans to find a modal that is usually closed.** `GameLibrary`
  runs `games.find`, `unratedGames.find`, `wishlist.find` on every render even
  when the editing ids are `null`. Short-circuit on the id and memoize.
- **`StatsPanel` and `SqlQueryPanel` mount on every played-view load.**
  `statsOpen` only toggles a CSS transform, so `GameStats`' five aggregation
  passes and `SqlQueryPanel`'s `games.map` + `flatMap` (several hundred objects)
  run for every visitor, and the off-screen DOM is prerendered and hydrated.
  Latch the mount on first open and add `next/dynamic` to get both out of the
  initial bundle. (`alasql` is already correctly deferred.) Tradeoff: the first
  open mounts already-open, so the slide-in is skipped unless you mount with
  `isOpen={false}` and flip in a `requestAnimationFrame`.

## T3.9 Play-state derivation in SQL

**Files:** `api/app/repositories/users.py`, `api/app/services/users.py`

`derive_play_state` loads every `PlaySession` row for the library as a fully
instrumented ORM object, then reduces each game's list to `max(end_date)`,
`max((start_date, id))` over open rows, and `len()`. Every object is then
garbage. O(S) ORM construction to produce O(N) scalars.

Two levels:

- **Cheap and safe:** `select(PlaySession.id, .game_id, .start_date, .end_date)`
  — plain tuples, no instrumentation. `derive_play_state` already touches only
  those four attributes.
- **Full:** one `LEFT JOIN` against a `GROUP BY game_id` subquery using
  `count(*)`, `max(end_date)`, and `max(...) FILTER (WHERE end_date IS NULL)`.
  Transfers N rows instead of N + S and deletes the Python grouping loop. The
  `FILTER` aggregates are unambiguous _because_ of the partial unique index.

**Take the cheap one unless you have a reason.** `derive_play_state` is a pure,
well-tested function (`tests/test_play_state.py`); moving it into SQL trades
Python you can unit-test for SQL you cannot. Two agents ranked this last for
exactly that reason, and the data volumes do not justify it (6 sessions across
155 games in the fixture).

While you are there: both `derive_play_state` and `repositories/me.py` carry
tie-break logic for multiple open sessions, which
`uq_play_sessions_one_open_per_game` makes impossible. Two copies of unreachable
defensiveness.

---

# Deliberately not recommended

Reviewed and rejected. Do not "fix" these without new information.

- **Rendering follow counts from `profile.followerCount`.** An agent proposed
  it to save two round trips. `LibraryPage` deliberately counts the lists
  instead, and documents why at length: the counts and the lists come from
  different endpoints, and a 404 on the list endpoints degrades to an empty
  list, so the two can disagree and render "3 followers" above a tab saying
  nobody follows this user. One source cannot contradict itself. Revisit only
  if the lists are ever paginated, when `.length` stops meaning total.
- **Parallelizing the profile fetch in `LibraryPage`.** `getProfile` is awaited
  alone before the other four so an unknown username 404s instead of throwing
  the loud "API is unwell" error. Firing all five and awaiting the profile first
  saves one round trip on cold renders but fires four throwaway requests on the
  404 path and needs `.catch()` ceremony at kick-off to avoid unhandled
  rejections. The existing comment already weighs this.
- **Moving the seeded-founder check out of the render path entirely**
  (`/health/seeded`, or a build-time assertion). Buys correctness of _shape_
  rather than behavior. T3.4 gets most of the benefit for far less. If you do
  T3.4, leave a comment marking that branch as the last founder-shaped one.
- **`LIBRARY_OWNER_USERNAME` → its own `founder.ts` module.** Cosmetic churn
  across seven files. The applied pass fixed what actually mattered: the stale
  comment claiming it decides edit affordances (untrue since Phase 4) and the
  missing cross-reference to `FOUNDER_USERNAME` in `api/app/core/config.py`.
- **`Game.id`, `sessionCount`, `openSessionId` made non-optional.** Genuinely
  correct — the API schemas mark them required, and the optionality forces
  guards that can never fire (`GameCase`'s `game.id !== undefined`,
  `EditGameModal`'s `?? 0`). Rejected only on sequencing: it touches the same
  components as T3.1/T3.2/T3.3 and is much easier once those land. Worth doing
  after, not before.
- **Unifying `MyProfile` / `UserSummary` / `LibraryProfile`** (three
  declarations of `{username, displayName}`). Each is documented as mirroring a
  specific Python schema 1:1, so a backend field change breaks exactly one type.
  That is a defensible reason to keep them separate. Listed so it is a decision
  rather than an oversight.
- **Threading `userId` from `mutate()` into `revalidateMyLibrary()`** to avoid
  resolving the session twice per write. The gain is two cookie parses; the risk
  is the carefully documented security contract on `fetchMyUsername` ("ONLY SAFE
  AFTER A WRITE THE API ALREADY ACCEPTED"). Not worth it.
- **`AuthButton`'s page-global `data-authed` side effect.** Real altitude smell
  — a leaf control maintaining page-global state that `SignupCta` depends on,
  with the coupling invisible in both components' props. The fix is an
  `<AuthFlagSync />` mounted once in `src/app/layout.tsx`, which would make the
  flag honest site-wide rather than only on library pages. Touches the root
  layout, so it deserves its own decision rather than a drive-by.
