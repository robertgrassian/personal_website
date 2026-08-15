# Make viewing a game's details better: the back of the case truncates genres and there is no way to see the rest. Design is part of this task.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

`GameCaseBack.tsx` renders `genres.slice(0, 2)` plus a `+N more` span — and that span is plain text,
not a control, so the hidden genres are genuinely unreachable from the shelf. Genres are the only
truncated field: name is `line-clamp-2`, system and release date render in full.

_Two things to hold onto, per the ask:_ keep the rotating case, it is the best thing on the page;
and do **not** solve this by cramming more onto the back face, which is a ~2.5rem-tall text column
at `text-[10px]` and already full.

_Leading candidate, added 2026-08-07:_ **clicking a case makes it grow and travel to the center of
the screen as it flips**, so the back face is a full reading surface rather than a 96px-wide column:
every genre listed, and plausibly the owner edit controls hosted right there on the back instead of
in `EditGameModal`. This would _replace_ the truncation problem rather than work around it, which is
why it is written as this item's likely answer rather than a separate one.

_What that shape costs, since it is more than a scale transform:_ the case is `w-24` inside
`ShelfSection`'s `repeat(auto-fill, 96px)` grid, so a case that grows in place either reflows the
shelf or gets clipped by it. The enlarged case therefore wants to leave the shelf flow (a portal or
a fixed-position overlay with a scrim) while a placeholder holds its slot, and the flip animation
and the travel animation have to be one continuous motion or it will read as two separate things
happening. `.game-case-inner` currently owns both the `preserve-3d` flip and the `group-hover` lift
(`src/app/video-games/video-games.css`), so whichever element animates position cannot be that same
element without fighting its transform. The mobile flip-lag bug was about this exact element and
**shipped 2026-08-08** (see Recently Completed), so this no longer has to wait on it — but read that
entry first, because the fix that worked was a `will-change: transform` compositing head start
scoped to the pressed case, and a new animation on the same element can undo it.

_If edit moves onto the back face, decide what happens to `EditGameModal`._ It is not just a rating
picker — it holds start/stop session, log a past session, remove from library, and the drafted
rating write plus its Save. Hosting all of that on a card face means either the card becomes the
modal (and `EditGameModal` is deleted) or the two coexist and drift. Related and pulling the same
way: "make library and wishlist entries fully editable" wants one shared field form in both modals,
and "an easy way to view a game's sessions" explicitly wants a bigger surface than the edit modal
comfortably holds. Sequence those three deliberately.

_Smaller alternatives, kept in case the big version is too much:_ a "more" affordance on the back
that opens a popup with the full metadata, a hover/long-press tooltip listing all genres, a details
panel that slides in beside the shelf rather than over it, or making each genre a chip that sets the
genre filter (which turns the overflow problem into a navigation feature).

_The wiring detail that will bite whichever design wins:_ the entire case is one `<button>` with
`onClick={() => setFlipped(f => !f)}` (`GameCase.tsx`), so a clickable element **inside** the back
face is a button nested in a button, which is invalid HTML and unreliable for keyboard and
screen-reader users. `GameCase` already solved this once for the owner pencil: it is an
absolutely-positioned **sibling** of the flip button, not a child (there are two comments in
`GameCase.tsx` explaining exactly that, one above the flip button and one on the pencil). Follow
that pattern, or make the back face stop being a button. Whatever opens must also work on touch,
where there is no hover.

Related: the "notes / play journal" backlog item below wants a bigger reading surface for per-game
data too, so a details view built here is likely where notes end up living.
