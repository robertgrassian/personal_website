# The built-in shelf remounts part of every group's game cases on load

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

## What happens

`useShelfBoards` starts `columns` at `0`, which its `boards` memo reads as "not measured yet"
and returns `[games]`: one tall bay holding the entire group. A `useLayoutEffect` then measures
the row, computes the real column count and re-cuts the group into one board per row.

Games that land in a different bay after the re-cut have a different parent element. React keys
are scoped to their parent, so those cases are unmounted and remounted rather than moved, which
recreates their `<img>`. The first row of each group keeps its parent and is unaffected.

## What was measured, and what it is not

A temporary probe counting `GameCase` mounts reported **381 mounts and 12 re-cuts over 666ms** on
a fresh load of `/video-games`.

**That number is inflated and should not be quoted as-is.** `reactStrictMode` is unset, so Next 15
defaults it to `true` in dev, and StrictMode double-invokes mount effects. Halving gives roughly
190 real mount effects for a library of ~155 cases, so the actual waste is on the order of **35
cases remounting**, not 381. Confirm with a production build before sizing any fix.

Two things this is _not_:

- **Not the desktop zoom stall.** That was `feTurbulence` re-rasterising, fixed by baking the
  grain. The same probe recorded **zero** re-cuts and zero mounts during a zoom, because the
  library sits in a `max-w-7xl` container: browser zoom does not change its CSS width on a wide
  desktop, so the column count never changes and no re-cut fires.
- **Not a confirmed user-visible defect**, which is why this is in Backlog / Ideas rather than
  Bugs. The colour flash a remount used to cause was already fixed by seeding `GameCase` from the
  module-level cache in `dominant-color.ts`. Whether the recreated `<img>` visibly flashes on a
  cold cache is **unverified** - check that before treating this as a bug.

## Approaches, and the trade-off

_Measure before the games render._ Render the carcass with one empty `.shelf-row`, measure that,
then render the games once `columns` is known. Small change, and cases mount exactly once on load.
It does not help on a real resize that crosses a column threshold, where games still change bay.

_Stop games changing parent at all._ Drop the per-row bay elements and go back to one grid per
group, painting the boards, back panel and walls as a repeating background at the row pitch. This
is how the shelf behaved before this theme existed, so no re-cut, no measurement, no remount ever.
It is the real fix and the larger one: it changes what a `shelves/` group owns, and the bay faces
currently rely on being real elements with `clip-path` trapezoids.

The counter-argument to doing either: ~35 remounts of an already-cached image may cost nothing a
user can perceive, in which case the cheapest correct action is to delete this entry. Establish
the symptom before spending the redesign.

## Related

- **Per-user library customization** also touches `shelves/`; if the grid rewrite happens, do it
  before a second theme depends on the current bay structure.
