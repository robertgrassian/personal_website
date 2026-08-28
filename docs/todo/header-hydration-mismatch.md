# Intermittent hydration mismatch in the sticky library header at very short viewports.

_Section: **Bugs** &middot; index: [`TODO.md`](../../TODO.md)_

React reports "Hydration failed because the server rendered HTML didn't match the client" on
`/video-games` and discards that subtree, re-rendering it on the client.

_The symptom, from the reconciler's own diff._ At the button row in `GameShelves`' sticky header,
the server HTML has the Stats button (`aria-label="Open library stats"`, an `svg` child) in the
position where the client renders `handleAddGame` (a `span` child). So the client's first render
produces one MORE button than the server sent, and everything in the row shifts by one. "+ Add game"
is owner-only, which points at the owner answer being known during the first client render but not
during the server render.

_What was actually reproduced, 2026-08-24._ Playwright, Chromium, a 393x430 viewport:

| condition     | hydration mismatch |
| ------------- | ------------------ |
| logged out    | 0 of 4 loads       |
| with `?debug` | 1 of 4 loads       |

It also reproduces on **main**, with the per-game notes branch stashed (2 of 3 loads), so it is not
that work. Never seen at 635px, 645px or 850px of viewport height, only at 430px.

_What is NOT established, and must be before fixing._ Every reproduction used `?debug`, which grants
ownership as a UI gate (see `src/lib/debugMode.ts` and `docs/mobile-viewport.md`). Whether a
genuinely signed-in owner hits this is **unverified** — the local Supabase stack was not available.
`?debug` is a deliberate stand-in for a signed-in owner, so it is suggestive, not proof. Confirm
against a real session before spending time on a fix: if it is `?debug` only, this is a
development-mode artifact and barely worth fixing.

Why the viewport height matters at all is also unexplained. Nothing in the header obviously branches
on height, so the height dependence is most likely a timing effect rather than a layout one, and
that is a guess, not a finding.

_Not the same as **Owner edit affordances still pop in**._ That one is a visual delay and produces
no mismatch: the answer arrives in an effect, after hydration, so React sees an ordinary update.
This is the first client render already disagreeing with the server, which is a different failure
and would survive any fix that only made the affordances appear sooner. They are likely to be
touched together, since both are about when ownership becomes known, but fixing one will not fix
the other.

_Severity._ Filed at the bottom of Bugs deliberately: a logged-out visitor never sees it, so it does
not block sharing the site. The cost is a discarded and re-rendered subtree for the owner.
