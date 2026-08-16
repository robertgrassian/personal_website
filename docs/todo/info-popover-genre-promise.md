# The add form's info popover can promise genres the add then fails to store.

_Section: **Bugs** &middot; index: [`TODO.md`](../../TODO.md)_

Found in the code review of this branch (2026-08-14) and accepted as a known limit rather than
fixed. The popover (`CatalogInfo`) and the add itself go through the same decision
(`_sourced_genres` in `api/app/services/me.py`), so they cannot disagree about the **rule** — but
each makes its own `lookup_one` call. Wikipedia answering the preview and timing out during the POST
means the popover showed "Metroidvania" and the catalog row got IGDB's coarse fallback. Rare (it
needs the lookup to succeed and then fail seconds later) and self-limiting (the genres are wrong,
not missing), which is why it is filed here rather than fixed.

_Why the obvious fix does not work._ Memoizing the lookup so the preview warms the write is the
natural answer and the API is a Vercel serverless function, so the two requests may not share a
process. A durable cache means a table, which is a lot of machinery for a narrow window.

_The cheaper answer, if it ever matters:_ let the client send the previewed genres on the POST and
have the server use them when present. Explicitly **declined 2026-08-14** on the grounds that it
adds a second path through the write path and lets a crafted POST pick the genres every later owner
inherits — the same trust question as **"Anyone can define a shared catalog row for everyone"**
Re-decide the two together, not separately.
