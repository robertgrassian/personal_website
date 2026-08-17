# The genre lookup picks the wrong Wikipedia article for two titles, at a confidence score of 1.0.

_Section: **Bugs** &middot; index: [`TODO.md`](../../TODO.md)_

Narrowed 2026-08-14 from a seven-case bug: `_rank_key` (`api/app/services/genres.py`) now demotes a
`(... series)` / `(... franchise)` article below any game article it ties with, then prefers the
candidate with the fewest leftover words, then the shortest title measured with its disambiguating
parenthetical removed. Re-measured over all 155 titles in `api/scripts/fixtures/games.csv`: 8 picks
changed, 0 regressed. Five of the seven are fully fixed, plus two extra improvements (`God of War`
was landing on _God of War (franchise)_, `Portal` on _Portal (series)_).

_What is left, case one: the search never sees the right article._ `Call of Duty: Modern Warfare 3`
still resolves to the _– Defiance_ DS spinoff. Measured by calling `search_candidates` directly: the
real article is **not among the five candidates at all** (they are MWIII 2023, COD4, MW2, MWII 2022
and Defiance). No ranking change can reach it, so fixing it means changing what `search_candidates`
asks for, which is the larger job this entry now mostly stands for. Genre impact is small: Defiance
is still a first-person shooter.

_What is left, case two: two candidates that are string-identical._ `Bomberman DS` no longer picks
the unrelated _Bomberman Story DS_, but lands on _Bomberman (1985 video game)_ rather than the
correct _Bomberman (2005 video game)_. Both strip to exactly "Bomberman", so they tie on every
component of the rank key and `max` takes whichever the search listed first. **No title-based rule
can separate them** — this needs a different signal (release year against the shelf's
`release_date`, or platform against `system`), which is a new input to the ranker rather than a new
tiebreak. Genre went from "Puzzle, Action Role-Playing" to "Maze"; the curated value is "Action,
Puzzle", so this one is still wrong, just wrong from a Bomberman game instead of a spinoff.

_The best next move, identified in review of the fix and better than any title-based rule._ The
series signal is already in the data `lookup_many` has **already fetched**. These articles pass
`is_video_game` because they carry `{{Infobox video game series}}`, and `_INFOBOX_VIDEO_GAME` has no
terminator after "game" so it matches that variant too. Detecting the template and threading a flag
into `_rank_key` would replace the current `_SERIES_ARTICLE` title regex with the direct signal, and
would catch the franchise articles that carry **no parenthetical at all** (_Super Mario_, _The
Legend of Zelda_), which a title regex structurally cannot see. It would very likely remove the need
for the leftover-words term entirely. Note `_rank_key` takes only `(name, article)` today, so this
means changing its signature or closing over the wikitext at the call site in `lookup_many`.

_Constraints any further change must keep._ `_title_similarity`'s containment rule and its
`_SERIES_MARKER` guard exist to stop "Hades II" matching "Hades", and combined articles (_Pokémon
Scarlet and Violet_, _Super Smash Bros. for Nintendo 3DS and Wii U_) must keep scoring 1.0. "Kinect
Adventures" must keep resolving to _Kinect Adventures!_ rather than _Kinect: Disneyland Adventures_.
All are covered by tests in `api/tests/test_genres.py`. `MIN_WRITE_CONFIDENCE` and the backfill's
`AUTO_ACCEPT` are calibrated and are not the lever here.

_How to validate._ Re-run the lookup over all 155 fixture titles and diff the chosen article before
and after. Recording the candidate lists as well as the pick lets any ranking rule be re-scored
offline, which is much faster than a second network run.

Related: **"Audit the genre vocabulary"** in Backlog / Ideas is the other half of genre quality.
The same class of problem one identifier over was the eleven catalog rows whose `igdb_id` pointed at
an IGDB variant, fixed 2026-08-17.
