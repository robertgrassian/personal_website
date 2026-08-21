# An easy way to view a game's sessions, and ideally edit old ones.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Requested alongside the confirmation-toast item as its own item, then re-asked 2026-08-07 with the editing half
attached: today you can create sessions and close them, but nothing in the UI ever lists them, and
nothing anywhere can change one after the fact.

_Two-thirds of the backend already exists, in a useful way._ `list_play_sessions`
(`api/app/repositories/users.py`) already loads every raw `play_sessions` row for the whole library
on every read, then collapses them into the five derived fields `GameRead` exposes (`session_count`,
`currently_playing`, `last_played`, `playing_since`, `open_session_id` —
`api/app/schemas/users.py`). So the rows are in hand server-side and no new query is needed. What
does not exist is any **GET** for sessions: `me.py` has only `POST /me/games/{id}/sessions` and
`PATCH /me/sessions/{id}`, and `users.py` exposes none at all.

_The decision that shape hangs on:_ widen `GameRead` to carry the session list, or add a dedicated
endpoint. Widening is nearly free to implement but inflates every library payload (155 games' worth
of session rows) for a detail almost nobody opens, and that payload is the prerendered, cached
`/video-games` page. A dedicated read is more code but keeps the shelf payload lean. If it becomes a
public endpoint rather than a `/me/*` one, remember libraries are public, so sessions become public
too: decide that on purpose.

_Editing is the more expensive half, and the backend genuinely does not do it._ `PATCH
/me/sessions/{id}` looks like a general session edit but is not: its body is `SessionClose`
(`api/app/schemas/me.py`), which carries only `endDate` plus an optional rating, and
`close_my_session` 409s on a session that is already closed. So changing a past session's start
date, correcting its end date, or deleting a session logged against the wrong game all need new
endpoints (a real `SessionUpdate` and a `DELETE`) plus service and repository work, not just UI. Two
rules the create path already enforces and any edit must re-enforce: `endDate` not before
`startDate`, and at most one open session per game (`create_my_session` returns 409 otherwise) —
reopening a closed session by clearing its end date walks straight into that. Deleting the last
session of a currently-playing game also silently un-plays it, which is a visible change to the CRT
and worth confirming in the UI rather than just doing.

_Where it lives is settled_ (2026-08-20): under the divider on the detail card, which is the bigger
reading surface this was waiting for. `GameDetailCard` carries a comment pointing back here. The edit
modals it used to name are gone. What remains is entirely backend: the GET below, plus a real
`SessionUpdate` and a `DELETE` for the editing half. Related: the "notes / play journal" item
floats hanging dated entries off `play_sessions` rather than the game row, which would make this the
same screen; and the audit-log/undo item is the safety net for a mis-clicked session delete.
