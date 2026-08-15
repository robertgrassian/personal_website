# Audit the genre vocabulary, fix the wrong values in the database with a script, and stop them coming back.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Prompted by **Star Fox Adventures being the only game tagged "Shooter"**, which is both wrong for
that game and useless as a filter. The ask is the audit first: sweep for genres like it, then decide
per case between a one-off replace script, a block list, and a genuinely smarter picker. Named as a
known weak point of the system, and of game sites generally.

_The premise is unverified against the database, so start there._ The seed fixture
(`api/scripts/fixtures/games.csv`) records Star Fox Adventures as `Action-Adventure`, and ~19
fixture rows carry some spelling of "shooter", so whatever produced today's state happened **after**
seeding. Most likely the Wikipedia backfill moved the other shooters onto the more specific infobox
terms ("First-person shooter", "Third-person shooter") and left this one row on the bare word: that
is a plausible reading of the code and the fixtures, not something confirmed by querying prod.
Confirm before fixing, because it changes whether this is one bad row or a systematic
coarse-vs-specific split.

_The audit query names itself, which makes this cheaper than it sounds._ `useFilterOptions` builds
`allGenres` by flat-mapping every game's genres with **no minimum count**, so a genre held by
exactly one game earns a permanent dropdown entry that filters to that single game. "Genres with a
count of 1" is therefore both the detection rule and the exact symptom complained about. Count 2 is
worth eyeballing too.

_Both tools the ask imagines already half-exist, and the gap between them is the real work._ **The
block list** is `THEME_VALUES` + `normalize_genre` (`api/app/services/genres.py`). But it is only
reachable from the Wikipedia path: `normalize_genres` is called from `lookup_many` and
`_fill_gaps_from_wikidata` and nowhere else. The add-game write path validates through
`clean_genres` (`api/app/schemas/me.py`), a different function that only trims, dedupes
case-insensitively and caps at `MAX_GENRES`. **So adding "Shooter" to `THEME_VALUES` today would not
stop the add form writing it.** Making a block list actually bite means calling the normalizer from
`clean_genres`, which is the change of shape hiding in this item. **Premise narrowed 2026-08-14, and
this is most of the item:** the add path now sources genres through `genre_service.lookup_one`,
which runs `normalize_genres` internally, so `THEME_VALUES` **does** bite every IGDB add today. The
hole that is left is genres **typed by hand** on the manual path, which still reach `clean_genres`
and nothing else. So the remaining work is smaller than written: route `clean_genres` through the
normalizer, or accept that a hand-typed genre on a private row is the owner's business. **The
replace script** is `scripts/backfill_genres.py`, which already has plan → review → apply with
`docs/genre-backfill-runbook.md` as the procedure; what it does not have is a targeted mode
("replace genre X with Y everywhere", "drop genre X"), since it re-sources the whole library from
Wikipedia, which is a much bigger hammer than an audit fix wants.

_The counter-argument to blocking, which `THEME_VALUES` makes itself:_ its comment warns that
guessing deletes genuine genres unseen, and that "Horror" and "Cozy" read like themes but are real.
"Shooter" is not junk, it is **too coarse for this row** - blocking it library-wide would be wrong
the day a game arrives whose best genre really is plain Shooter. So the likely answer is per-game
corrections plus a small coarse → specific rule, and the block list stays reserved for values that
are never right.

_On the "really smart picker" ambition, before building one._ There is now **one** vocabulary rather
than two: Wikipedia infoboxes, on the add path and in the backfill alike (2026-08-14). IGDB's coarse
genres survive only as the fallback for a title Wikipedia cannot resolve. Wikidata's `P136` was
tried as a structured third source in 2026-07-30 and **rejected** as frequently thin or wrong
(Kinect Sports as "association football video game", Minish Cap as "role-playing video game"); it
survives only as a fallback for infoboxes with no genre field, so do not re-propose it as the clean
machine-readable answer. The cheap experiment for a third is an LLM pass over name + Wikipedia lead
+ IGDB genres run **offline inside the backfill's plan step**, where a human already reviews every
changing row: the review gate that makes a bad automated genre survivable exists only there, not in
the live add path. Do not put a model in the write path first.

_The constraint that applies to every fix here:_ genres live on the **shared** `game_metadata` row,
so correcting one rewrites the genre for every user who owns that game (the runbook says this
outright). Fine for one curator, re-think before strangers.

Related: **"Take a pass at the catalog rows whose `igdb_id` points at a variant"** in Up Next -
those eleven rows carry the _variant's_ genres, so some of what this audit turns up is that item's
job rather than this one, and doing it first shrinks this list. And **"Make library and wishlist
entries fully editable"** below would give genres a write path from the UI, at which point one-off
corrections stop needing a script at all.
