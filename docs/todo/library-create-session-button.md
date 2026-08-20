# Library-level "create session" button (owner-only)

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Start or log a session for any game without opening that game's pencil/edit modal: a game picker
(search the library) plus the same dates form the modal already has. **That form is now extracted**
(2026-08-19): render `SessionDateFields` and commit with `saveGameEdits(gameId, { session })`, both
of which already exist, so this really is just the picker plus a Save. Note there is no longer a
separate "start now" control: an end date left empty IS the open session.

_Stretch goal:_ accept a game that is **not** in the library yet ("I just started something new").
That flow would add the game via IGDB search (the Phase 3 slice 4 proxy) and open its session in one
go.

_Where the work is._ The backend already supports everything except add-and-start-in-one; this is
mostly UI. Keep it simple and iterate later.
