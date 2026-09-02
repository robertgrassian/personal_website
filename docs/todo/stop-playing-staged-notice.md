# Rethink the staged "Stop Playing" notice and its Undo, which are both too easy to miss

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

## The ask

Pressing "Stop Playing" does not write anything. It stages the close, and the only thing that says
so is one line in `GamePlayHistory`: "Will be marked finished today when you save." followed by an
Undo. The line is `text-xs`, the Undo is `<Button variant="ghost">` (an underlined 12px text link), and the
whole thing sits between the session list and the "Add a Playthrough" heading. It is easy to miss
that anything is pending, and harder still to spot how to take it back.

## What makes it worse than it reads

_You can arrive already staged._ "Stop Playing" on the card's detail face sets the pending stop and
switches to the play-history face, so the notice is not something you caused on the screen you are
looking at: it is the state the screen opened in. Someone who pressed a button called "Stop
Playing" and then sees no obvious confirmation may well press Save without registering that the
small line above it was the confirmation.

_It is the only staged edit with no visible control._ Every other pending change on the card is
still sitting in the control that made it: a changed rating is the lit tile, a changed system is
the text in the field, a playthrough is the dates in `PlayedFields`. Undoing any of them means
putting the control back. The stop has no control to return to. That asymmetry is the real problem,
and it is why "make the text bigger" is probably not the answer.

## What has already been tried, so it is not re-proposed

The detail face used to lose the staged stop entirely when you navigated back to it, because
`GamePlayHistory` unmounted and took `stopPending` with it. That is fixed: `GameEditFields` owns
the flag now and both faces render the same staged-stop control, so the state cannot go invisible
by navigation. That is the floor, not the fix. The notice is still small on both faces.

## The decision to make

Which of these the stop actually is:

1. **A staged edit, like every other one on this card**, in which case it needs a control that shows
   its own state, not a sentence. A two-state toggle ("Playing" / "Finished today") would put the
   stop back in the same shape as the rating tiles, and the Undo becomes "press it again".
2. **A destructive action**, in which case it belongs behind `ConfirmStep`, the sheet the Remove
   button already uses, and it stops being staged at all.

Option 2 is the smaller change and the wrong one, most likely: stopping a playthrough is reversible
and low-stakes, and a modal sheet for it would be heavier than the thing it guards. Recorded so the
trade-off is re-decided rather than re-litigated. Option 1 is a rework of the control, which is why
this is a design item and not a copy tweak.

Whatever wins, the same question applies to the "one Save commits both faces" model generally: a
pending change made on the face you are not looking at is invisible until you go back to it. A
count on the Save button ("Save 2 changes") is one answer that would cover the stop and everything
else at once, and would want deciding alongside
**Show a confirmation toast after logging a session** rather than separately.

## Related

- **Show a confirmation toast after logging a session, so you know it worked** is the same problem
  after the write; this one is before it.
- **An audit log of important library actions, primarily so a change can be undone** is the
  after-the-fact undo. If a stop is easy to reverse post-save, the pre-save notice matters less.
