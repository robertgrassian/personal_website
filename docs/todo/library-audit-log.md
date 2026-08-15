# An audit log of important library actions, primarily so a change can be undone.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

No such table exists today: `api/app/models/` holds only `profile`, `game`, `wishlist_item`,
`follow` and `igdb`, and nothing in the write path records what changed. Rating a game wrongly,
deleting a game, or promoting a wishlist entry are all one-way from the UI.

_The ask, in order of what it is for:_ **(1)** undo, implemented by replaying from the log (undoing
"rating A → B" is a normal write of A, itself recorded as a new row); **(2)** a general record of
important actions to grow other features on: a recent-activity feed, per-game change history.

_The design decision everything hangs on: what a row holds._ An action name plus before/after values
as JSON is enough for undo and cheap to write, but it is a second copy of the data that can drift.
Deleting a game is the case that forces the issue: `play_sessions` cascades on game delete (there is
a comment on the FK in `api/app/models/game.py`), so undoing a delete cannot restore the sessions
unless the log row carried them, and a restored game gets a new id, orphaning any later log row that
referenced the old one. Decide whether delete is undoable at all, or whether undo covers only field
edits.

_Where it gets written:_ every owner write goes routers → services → repositories under
`/api/py/me/*`, so the log belongs at the service layer, in the same transaction as the change — a
log entry that can go missing is not one you can undo from. Note `rate_limit_writes` commits
**separately** on purpose, for the opposite reason (see the Tier 3 refactor item above); do not copy
that shape here.

_Two smaller things to settle:_ retention, since this is the one table with no natural cap
(`max_games` on `Settings` in `api/app/core/config.py` — default 2000, env-overridable, enforced in
`api/app/services/me.py` on both create paths with a dedicated 403 — bounds rows, but nothing bounds
edits); and whether undo is an affordance with a time window (an "Undo" link in a toast, which wants
the toast item below first) or a history view the owner browses. Either way decide what happens when
state moved on: undoing a rating edit after a later edit should probably refuse rather than silently
overwrite.
