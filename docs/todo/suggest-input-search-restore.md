# A dropdown change mid-search can put back a character you already typed past.

_Section: **Bugs** &middot; index: [`TODO.md`](../../TODO.md)_

Raised by the code review of this branch (2026-08-12) and **not reproduced** — read the mechanism
below and confirm before fixing, because this is the same bug that `pushedSearchValues` in
`useGameLibraryUrlState` was built to kill, and the comment on that ref is a good record of what has
already been tried.

_The mechanism, from reading the code._ There are **two** writers of `?search` and only one of them
registers what it wrote. The debounced search effect adds its value to `pushedSearchValues` before
calling `router.replace`. But `updateParam` — every dropdown, via `paramsWithLiveSearch()` — also
writes the live search value into the URL, and adds nothing to the set. So changing a dropdown while
a search push is still in flight produces an echo carrying the same string, which
`pushedSearchValues.current.delete(fromUrl)` consumes as if it were the search effect's own. When
the real echo lands a moment later the set is already empty, so it is read as an external navigation
and written back over the input — putting back the string as it stood before the last keystrokes.

_What this means for the fix._ The review's suggestion was a per-push counter, but the existing
comment argues against a count for a good reason: a coalesced transition that never echoes drains it
wrong and starts swallowing real navigations **forever**, where matching on value is
self-correcting. The likelier fix is to make the second writer register too, so `updateParam`
accounts for the `?search` it carries. Confirm the interleaving first: it needs a dropdown change
inside the 300ms debounce plus a transition, which is a narrow window and may be why nobody has hit
it.
