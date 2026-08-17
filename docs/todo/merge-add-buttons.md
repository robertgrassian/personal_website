# Fold "+ Add to wishlist" into a single "+ Add game" that picks its destination.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

_Most of this already exists._ `GameLibrary.tsx` swaps the button label by view, and `AddGameModal`
already takes a `target: "library" | "wishlist"` prop that swaps the rating picker for a star
checkbox and makes the system optional. So the modal can already do both. What is missing is a
destination switcher (two tabs) inside it, defaulted to whichever view the button was clicked from.

_Watch:_ `target` currently changes which fields are required, so the switcher has to re-validate
rather than just re-label. Flipping from wishlist to library with an empty system must block submit,
not silently post.

Collides directly with **When adding a game, let me say I'm playing it now**, whose play-history
section must disappear when the target is `wishlist`. Sequence the two deliberately.
