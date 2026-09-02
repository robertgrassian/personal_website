# Fold "+ Add to wishlist" into a single "+ Add game" that picks its destination.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

_Most of this already exists._ `GameLibrary.tsx` swaps the button label by view, and `AddGameModal`
already takes a `target: "library" | "wishlist"` prop that swaps the rating picker for a star
checkbox and makes the system optional. So the modal can already do both. What is missing is a
destination switcher (two tabs) inside it, defaulted to whichever view the button was clicked from.

_Watch:_ `target` currently changes which fields are required, so the switcher has to re-validate
rather than just re-label. Flipping from wishlist to library with an empty system must block submit,
not silently post.

_The collision is now real code, not a plan_ (2026-09-01): the confirm step renders a "Have you
played it?" section behind `target === "library"`, because a wishlist entry has no library row to
hang a playthrough off. The switcher has to hide it, and decide what happens to dates already
entered when you flip to wishlist. Discarding them silently is the thing to avoid; `usePlayDraft`
holds the choice and the dates together, so resetting both on a flip to wishlist is one call.
