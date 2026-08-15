# When adding a game, let me say I'm playing it now, or that I played it before: a play history section in the add-game form.

_Section: **Up Next** &middot; Promoted by request 2026-08-09. &middot; index: [`TODO.md`](../../TODO.md)_

Two asks, one surface. **(1)** A one-tap control (a check mark was the suggestion) that marks the
game currently playing as it is added, instead of adding it and then opening its pencil. **(2)** The
fuller version: the same form can also record a past playthrough, so adding a game you finished
years ago captures when. **Do not call it a "session" in the UI** — that is the database's word, and
nothing user-facing uses it today. "Playing this now" plus something like "I've played this before"
reads as one natural part of the add form.

_What exists to build on:_ `EditGameModal` already has both halves — a start/stop control and a
"From"/"To" past-dates form — and both go through `logSession` in `video-games/actions.ts`, which
takes `(gameId, startDate, endDate | null)` and treats a **null end date as the open session** that
makes a game currently-playing. So "playing now" is a past-dates log with the end left blank, and
the add form needs no new backend concept, only a new caller. `AddGameModal` today is the IGDB
search step plus `GameDraftForm`, which has no session controls at all.

_The one real blocker, and it is not in the UI:_ logging a session needs the new game's id, and the
add path throws it away. `POST /me/games` **does** return the created `GameRead` (see
`create_my_game` in `api/app/routers/me.py`), but `mutate` in `meApi.ts` collapses every write to
`MutateResult` (`{ ok: true }`), so `addGame` cannot tell the client what it just created. Either
widen that result for the create path, or add a server-side add-and-start endpoint. The second is
the thing to weigh: two sequential writes can leave a game added with its play history silently
missing, so decide whether a failed session log rolls the add back, warns, or is simply accepted
(probably accepted — a game in the library with no dates is a normal state).

_Library target only._ A wishlist entry is not in the library and has no game row to hang a session
off, so this section must disappear when the target is `wishlist`. That collides directly with
**"Fold '+ Add to wishlist' into a single '+ Add game'"** below, which adds a destination switcher
inside this same modal: the switcher would have to show and hide this section, and decide what
happens to dates already typed when you flip to wishlist. Sequence the two deliberately.

_Reuse, do not re-type, the date form._ **"Logging a past session should pick the whole range in one
calendar popup"** below already plans to pull that From/To control out of `EditGameModal`; building
a second copy here is what that item is trying to prevent. Same for **"Library-level 'create
session' button"**, whose stretch goal ("add a game I just started and open its session in one go")
is this exact gap approached from the other direction — folding them together is reasonable.

_This is the whole add-game screen's turn, per the ask._ Four other items touch this same form and
are cheaper done in one pass than four: **"Remove genre keyword search when adding a game"**,
**"Restrict the add-game 'system' suggestions to the platforms the game actually released on"**
(both since done), and the destination-switcher item above. The mobile combobox is done too, so any
redesign here inherits `SuggestInput` rather than a `<datalist>`.
