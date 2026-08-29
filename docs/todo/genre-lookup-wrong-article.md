# The genre lookup picks the wrong Wikipedia article for two titles, at a confidence score of 1.0.

_Section: **Bugs** &middot; index: [`TODO.md`](../../TODO.md)_

Narrowed twice from a seven-case bug. `_rank_key` (`api/app/services/genres.py`) demotes a franchise
overview below any game article it ties with, then prefers the candidate with the fewest leftover
words, then the shortest title measured with its disambiguating parenthetical removed.

**Ranking is now done, and the two cases left are not ranking problems.** Both need an input the
ranker does not have, so neither is reachable by another tiebreak.

_What shipped 2026-08-29: the franchise signal is read from the template, not guessed from the
title._ `is_series_article` matches `{{Infobox video game series}}` in the wikitext `lookup_many`
has already fetched, and `_rank_key` takes it as a keyword. This catches the franchise articles
carrying no parenthetical at all, which a title regex structurally cannot see: _Super Mario_, _The
Legend of Zelda_, _Super Smash Bros._ The last of those was pinned as a known limitation in
`test_genres.py` and now asserts the correct article instead. `_SERIES_ARTICLE` stays as a second
signal for a franchise page carrying the plain `{{Infobox video game}}`.

_What is left, case one: the search never sees the right article._ `Call of Duty: Modern Warfare 3`
resolves to the _– Defiance_ DS spinoff. Measured 2026-08-14 by calling `search_candidates`
directly: the real article is **not among the five candidates at all** (they are MWIII 2023, COD4,
MW2, MWII 2022 and Defiance). No ranking change can reach it, so fixing it means changing what
`search_candidates` asks for, which is the larger job this entry now mostly stands for. The cheapest
idea, not yet tried: seed the candidate list with the title verbatim, since `lead_sections` already
batches and dedupes and would cost no extra request. It needs the redirect map from that response
(`query.redirects`) to repoint a seeded title onto the article it resolves to, and it changes what
the search returns for all 155 fixture titles, so it wants the measurement below rather than a
merge on reasoning. Genre impact meanwhile is small: Defiance is still a first-person shooter.

_What is left, case two: two candidates that are string-identical._ `Bomberman DS` lands on
_Bomberman (1985 video game)_ rather than the correct _Bomberman (2005 video game)_. Both strip to
exactly "Bomberman", so they tie on every component of the rank key and `max` takes whichever the
search listed first. **No title-based rule can separate them**, and the template signal does not
either: both are games. This needs release year against the shelf's `release_date`, or platform
against `system` -- a new input threaded through `lookup_many`, whose signature takes bare titles
today, so it touches the router and `backfill_genres.py` as well. Genre is "Maze" against a curated
"Action, Puzzle".

_What is owed: the fixture measurement._ The 2026-08-29 change was validated by unit tests only,
because en.wikipedia.org is unreachable from the environment it was written in. Re-run the lookup
over all 155 titles in `api/scripts/fixtures/games.csv` and diff the chosen article against the
2026-08-14 run before trusting it in a backfill. The same run answers whether the leftover-words
term in `_rank_key` is still doing anything now the franchise rule fires on the template: it was
added to reach the untagged franchise articles the template now catches directly. Recording the
candidate lists as well as the pick lets any further ranking rule be re-scored offline, which is
much faster than a second network run.

_Constraints any further change must keep._ `_title_similarity`'s containment rule and its
`_SERIES_MARKER` guard exist to stop "Hades II" matching "Hades", and combined articles (_Pokémon
Scarlet and Violet_, _Super Smash Bros. for Nintendo 3DS and Wii U_) must keep scoring 1.0. "Kinect
Adventures" must keep resolving to _Kinect Adventures!_ rather than _Kinect: Disneyland Adventures_.
A franchise article that is the only candidate must keep being used rather than rejected, which is
why `is_video_game` matches the series template too. All are covered by tests in
`api/tests/test_genres.py`. `MIN_WRITE_CONFIDENCE` and the backfill's `AUTO_ACCEPT` are calibrated
and are not the lever here.

Related: **"Audit the genre vocabulary"** in Backlog / Ideas is the other half of genre quality.
The same class of problem one identifier over was the eleven catalog rows whose `igdb_id` pointed at
an IGDB variant, fixed 2026-08-17.
