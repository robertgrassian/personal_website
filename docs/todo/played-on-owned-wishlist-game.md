# "Played?" on a wishlist game you already own leaves the wishlist entry behind, and its Save just says "Save"

_Section: **Up Next** &middot; Promoted by request 2026-09-01. &middot; index: [`TODO.md`](../../TODO.md)_

## The premise to correct first: this is not the promote flow

"Played?" on a wishlist card has two branches, decided in `GameLibrary`'s `handlePlayed` because
that is where both collections are in hand:

- **The game is not in the library.** The card becomes a promote. That branch **does** remove the
  wishlist entry, because a promote moves the row: `promoteAndSave` calls
  `promoteMyWishlistItem` and revalidates `wishlistTag` alongside `gamesTag`. Its Save reads "Save
  And Move To Library", and its play choice opens on the neutral "Not yet".
- **The game is already in the library.** The card swaps to that game's own edit form
  (`kind: "game"`, `startWithSession: true`). Nothing touches the wishlist at all, the Save is the
  ordinary "Save", and the play choice opens on "Played it before" dated today, because
  `usePlayDraft` reads `startToday` as "the caller already asserted a past playthrough".

So the two halves of the report are one branch's behavior, and the inconsistency is real: the same
button on the same card either clears the wishlist entry or does not, depending on something the
person pressing it cannot see.

## Three decisions, and they are coupled

**1. Should the second branch remove the wishlist entry?** Stated preference: yes, and the
asymmetry is the argument. The counter-argument is written down in `WishlistEditFields`, on the
`onPlayed` prop: "a wishlist entry for a game you already own is legitimate (you want to replay
it), so both answers are ordinary." That was a deliberate call, not an oversight. It is also
defensible to say a logged playthrough is what settles it: wanting to replay a game and having just
replayed it are different states, and the second one has no wish left in it. Decide, do not
re-litigate.

**2. What should the Save button say?** Only answerable after 1. Today "Save" is accurate, because
nothing is removed. Candidates raised: "Remove from wishlist", "Remove from wishlist and save
playthrough". The goal stated is making it clear the press clears the wishlist entry, **without**
explaining that the game is not being moved to the library because it is already there. Note the
button may have nothing to log: a playthrough is optional on that form, so a label naming one is
wrong whenever the choice is left on "None".

**3. What should the play choice default to?** Stated preference: "currently playing", here and
everywhere a default is picked at all. Today this flow opens on "Played it before" with today's
date. Weigh: "Played?" is past tense, and opening on "currently playing" makes Save live on a form
nobody has touched, which is the hazard that sank an earlier attempt at a "currently playing"
default (see `usePlayDraft`, which records it). Neither objection is fatal here, because the
person did assert something by pressing "Played?", but the label reads oddly against the answer.

## The constraint an implementer hits immediately

**The swap throws away the wishlist row's id.** `expandedWishlistItem` is a `useMemo` that returns
`undefined` as soon as `expanded.kind` is `"game"`, and `handlePlayed` replaces the card's state
with the library game's id. By the time the form renders, nothing on screen knows which wishlist
entry sent it there. Removing that entry on Save means carrying the id through the swap, then a
write that deletes the wishlist row alongside `saveGameEdits` and revalidates `wishlistTag` as well
as `gamesTag`.

That write wants the same partial-application handling as `promoteAndSave` and `addGame`: the
playthrough and the wishlist delete are separate calls, so decide what a half failure says. The
existing precedent is that whatever landed stays landed and the message says so rather than
inviting a retry.

## Related

- **Add "owned" as a field to wishlist games** is the other end of the same question: if a wishlist
  entry can be marked owned, "you already have this" stops being something only `handlePlayed` can
  work out.
- **Fold "+ Add to wishlist" into a single "+ Add game"** shares the "which collection is this
  going to" problem from the other direction.
