# Editing and deleting past sessions.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Requested alongside the confirmation-toast item, re-asked 2026-08-07 with the editing half
attached. **Viewing shipped 2026-08-22, in both places it was wanted; this is the half that is
left.** Today you can create sessions, close them, and read them back, but nothing anywhere can
change one after the fact.

_What shipped, so it is not rebuilt:_

- `GET /users/{username}/sessions` (router → service → `list_sessions_for_user`), newest first,
  `{id, gameId, startDate, endDate}`. **Public**, decided deliberately: the derived play state
  already on `GameRead` comes from these very rows, so the raw list adds when and how often, not
  which games. `endDate` is `null` while open, breaking the `""`-for-absent convention on purpose.
- `sessionsTag` in `libraryApi.ts`, paired with `deleteGame`, `saveGameEdits` and `promoteAndSave`,
  the last two only when the Save actually touched a session.
- `getPlayHistory` + `usePlayHistory` (**one copy, owned by `GameLibrary`** — the stats panel never
  unmounts, so a second private copy would sit stale after a card logs a session).
- Across games: a "See all" link on **Recently Played** swaps `StatsPanel` into a history view.
- Per game, owner only: "View or add play history" in `GameEditFields` swaps `GameDetailCard`'s
  scrolling region for `GamePlayHistory` (list, "Stop Playing", and an add form). **Sessions moved
  OUT of `GameEditFields` for a real game and stayed inline only for a promote**, because
  `promoteAndSave` creates the row and logs the playthrough in one call and there is no game id
  until that Save lands.
- `SessionDateFields` gained `endDisabled`, driven by an **"I'm still playing this"** checkbox that
  makes "no end yet" explicit instead of a blank field nobody can see they left.

_The backend genuinely does not edit._ `PATCH /me/sessions/{id}` looks like a general session edit
but is not: its body is `SessionClose` (`api/app/schemas/me.py`), carrying only `endDate` plus an
optional rating, and `close_my_session` 409s on a session that is already closed. So changing a past
session's start date, correcting its end date, or deleting a session logged against the wrong game
all need new endpoints (a real `SessionUpdate` and a `DELETE`) plus service and repository work.

Two rules the create path already enforces and any edit must re-enforce: `endDate` not before
`startDate`, and at most one open session per game (`create_my_session` returns 409 otherwise) —
reopening a closed session by clearing its end date walks straight into that. Deleting the last
session of a currently-playing game also silently un-plays it, a visible change to the CRT that is
worth confirming in the UI rather than just doing.

_Where the UI goes is already built._ `GamePlayHistory` renders the rows; editing means making a row
open into the same date fields the add form uses, and a delete needs a `ConfirmStep` like the one on
"Remove from library". Both writes must purge `sessionsTag` as well as `gamesTag`.

Related: the "notes / play journal" item floats hanging dated entries off `play_sessions` rather
than the game row, which would make this the same screen; and the audit-log/undo item is the safety
net for a mis-clicked session delete.
