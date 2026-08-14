"""Genre lookup, sourced from Wikipedia rather than IGDB.

Why not IGDB, which we already talk to: its ``genres`` field is too coarse to
describe a library. Hades II comes back as "Role-playing (RPG), Hack and slash,
Adventure, Indie" with no mention of roguelike; Animal Well has no Metroidvania;
Bloodborne has no soulslike. Wikipedia's game infoboxes answer all three
correctly, and they are where the library's original genres were read from by
hand -- so they extend the vocabulary already on the shelves instead of
replacing it with a second one.

The lookup is a three-step cascade:

  1. Search **Wikipedia** for the title, keeping several candidate articles.
  2. Keep only candidates whose lead section contains ``{{Infobox video game}}``,
     then pick the one whose title best matches. This is both the "is it really
     a game?" test and the disambiguation step.
  3. Read the infobox's ``genre`` field. Only if that is empty does it fall back
     to Wikidata's ``P136``.

**The infobox is the primary source, not Wikidata, and that ordering is the
whole point.** Wikidata's P136 is structured and easy to batch, which makes it
tempting, but it is frequently thin or wrong: it calls Kinect Sports an
"association football video game", The Minish Cap a "role-playing video game",
and Dance Central a "music video game". The infobox says "Sports",
"Action-adventure" and "Rhythm" -- which is both correct and already the
library's vocabulary, because the original genres were read off these same
infoboxes by hand.

Two failure modes the candidate filtering exists to prevent, both observed:

  - Searching "The Legend of Zelda: Twilight Princess" ranks the **manga**
    article first, whose genres are "adventure anime and manga". Requiring
    ``{{Infobox video game}}`` rejects it.
  - Taking the first *game* candidate resolves "Hades II" to **Hades** and
    "Animal Well" to **Animal Crossing**. Ranking the surviving candidates by
    title similarity fixes both.

Outbound HTTP lives in the module-level ``_get`` seam so tests can stub the
network and still exercise the parsing and normalization for real, matching the
approach in services/igdb.py.
"""

import difflib
import logging
import re
from dataclasses import dataclass, field

import httpx

from app.core.text import fold_text as _fold
from app.models.game import MAX_GENRES

logger = logging.getLogger(__name__)

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"

# Wikimedia answers 429 to generic User-Agents; their policy asks for a
# descriptive one naming the tool and a contact. A bare httpx default gets this
# rate-limited within a dozen requests.
USER_AGENT = (
    "personal-website-genre-lookup/1.0 (https://github.com/robertgrassian/personal_website)"
)

# Deliberately tight. These phases run serially, so the per-request ceilings add
# up, and the live endpoint is called from a browser that gives up at 15s -- a
# generous timeout here buys nothing and holds a threadpool slot the whole time,
# which stalls every other sync endpoint once enough pile up. MediaWiki answers
# in well under a second normally.
_HTTP_TIMEOUT = 8.0
# WDQS is a shared public endpoint and slower than a normal API; it only runs on
# the fallback path, where a batch covers up to 50 ids.
_SPARQL_TIMEOUT = 20.0

# Values that describe a game's setting or mood rather than how it plays. They
# would land in the shelf filter's genre dropdown next to "Puzzle". Dropped
# rather than mapped -- there is no genre they correspond to.
#
# Two groups, because the two sources use different vocabularies. The Wikidata
# entries only fire on the P136 fallback path; the infobox entries are the ones
# that matter day to day, and the list was empty of them until "Iyashikei"
# (Japanese "healing" media -- a mood) turned up on Animal Crossing.
#
# Necessarily incomplete: this is a free-text field written by many hands, so
# treat it as a filter that gets extended when something new shows up, not as a
# closed set that can be got right once.
THEME_VALUES = frozenset(
    {
        # From Wikipedia infoboxes. Only add terms that actually turn up and
        # describe mood rather than play: "Horror" and "Cozy" read like themes
        # but are real genres, and guessing deletes genuine ones unseen.
        "iyashikei",
        # From Wikidata P136, used only when an infobox has no genre.
        "cyberpunk video game",
        "science fiction video game",
        "post-apocalyptic video game",
        "fantasy video game",
        "dark fantasy video game",
        "biopunk",
        "retro-style video game",
        "crossover fiction",
        "lgbt-themed video game",
        "video game with lgbt character",
    }
)

# Wikipedia editors annotate the genre field: "Tower defense game (primary)".
# Stripped before anything else, or the annotation becomes part of the stored
# genre and sits in the filter beside the un-annotated spelling of the same one.
_TRAILING_PAREN = re.compile(r"\s*\([^)]*\)\s*$")

# Wikidata spells most genres "<genre> video game" ("puzzle video game",
# "role-playing video game"). The library spells them "Puzzle", "RPG". Stripping
# the qualifier is what makes the two vocabularies line up without a per-genre
# alias table.
_QUALIFIER_SUFFIXES = (" video games", " video game", " games", " game")

# ...but for these, "game" is part of the genre's name rather than a qualifier,
# so stripping it produces nonsense ("god game" -> "God", "board game" ->
# "Board"). Matched on the full lowercased label, before any stripping.
# Only labels where the remainder is meaningless on its own belong here.
# "puzzle game" and "party game" are deliberately absent: stripping them yields
# "Puzzle" and "Party", which is exactly the library's existing vocabulary.
_SUFFIX_EXEMPT = frozenset(
    {
        "god game",
        "art game",
        "board game",
        "war game",
        "video game",
        "serious game",
        "browser game",
        "idle game",
        # "Card game" is the noun; stripping leaves "Digital Collectible Card".
        "collectible card game",
        "digital collectible card game",
        "trading card game",
        "card game",
    }
)

# WDQS's label service returns the bare Q-id when an item has no English label,
# so an unlabelled genre would otherwise be stored as the literal "Q108919152".
_BARE_QID = re.compile(r"^Q\d+$")

# Genres where the SOURCE contradicts itself, keyed by the normalized form and
# mapped to the spelling used by the majority of articles.
#
# Not a preference table. Nothing belongs here because a shorter or nicer word
# exists -- the library deliberately takes Wikipedia's vocabulary, so
# "role-playing" is stored as-is and is not folded to "RPG". An entry earns its
# place only when Wikipedia gives one concept two names, which the
# spelling-insensitive snapping in the backfill cannot reconcile: the Pokemon
# infoboxes say "Monster tamer" while Palworld's says "monster-taming", and
# loosening that matcher enough to connect them would also merge "Platform"
# into "Platformer".
SOURCE_SYNONYMS = {
    "monster-taming": "Monster Tamer",
}

# Words that stay lowercase in the middle of a Title Cased genre.
_MINOR_WORDS = frozenset({"and", "or", "of", "the", "a", "an", "'em"})

# Genres whose conventional casing Title Case would mangle ("4X" -> "4x",
# "LGBT" handled above). Keyed by the normalized-lowercase form.
_CASING_OVERRIDES = {
    "4x": "4X",
    "jrpg": "JRPG",
    "rpg": "RPG",
    "mmorpg": "MMORPG",
    "moba": "MOBA",
    "rts": "RTS",
    "fps": "FPS",
}


def _title_case(value: str) -> str:
    """Title Case a genre, capitalizing each hyphen-separated part and leaving
    minor words lowercase mid-phrase.

    ``str.title()`` is not usable here: it capitalizes minor words ("Hack And
    Slash" rather than "Hack and Slash") and breaks on apostrophes, turning
    "beat 'em up" into "Beat 'Em Up".
    """
    parts = value.split()
    out = []
    for index, part in enumerate(parts):
        if index > 0 and part.lower() in _MINOR_WORDS:
            out.append(part.lower())
            continue
        # Capitalize each hyphen-separated component ("turn-based" ->
        # "Turn-Based") without touching the separators themselves. Minor words
        # stay lowercase here too, or "point-and-click" becomes
        # "Point-And-Click".
        segments = part.split("-")
        out.append(
            "-".join(
                seg.lower() if i > 0 and seg.lower() in _MINOR_WORDS else seg[:1].upper() + seg[1:]
                for i, seg in enumerate(segments)
            )
        )
    return " ".join(out)


def normalize_genre(raw: str) -> str | None:
    """One raw Wikidata genre label -> the form stored on a game, or None when
    it should be dropped entirely (a theme, or empty)."""
    value = _TRAILING_PAREN.sub("", " ".join(raw.split()).strip())
    if not value:
        return None
    lowered = value.lower()
    if lowered in THEME_VALUES or lowered in {"game", "video game", "games", "video games"}:
        return None
    # An item with no English label comes back as its raw Q-id; storing that as
    # a genre would put "Q108919152" in the shelf filter.
    if _BARE_QID.match(value):
        return None
    if lowered not in _SUFFIX_EXEMPT:
        for suffix in _QUALIFIER_SUFFIXES:
            if lowered.endswith(suffix) and len(lowered) > len(suffix):
                value = value[: -len(suffix)]
                lowered = value.lower()
                break
    if not value:
        return None
    if lowered in _CASING_OVERRIDES:
        return _CASING_OVERRIDES[lowered]
    # Last, so it matches whatever the earlier rules produced rather than having
    # to anticipate every raw spelling the source might use.
    return SOURCE_SYNONYMS.get(lowered, _title_case(value))


def normalize_genres(raw: list[str]) -> list[str]:
    """Normalize a game's genre labels, dropping themes and duplicates while
    preserving order (the shelf shows them in the order stored)."""
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        cleaned = normalize_genre(item)
        if cleaned and cleaned.casefold() not in seen:
            seen.add(cleaned.casefold())
            out.append(cleaned)
    return out


@dataclass
class GenreLookup:
    """What the cascade found for one title.

    ``article`` is kept so a backfill can show which page it actually read,
    which is the difference between a plausible answer and a checkable one.
    ``qid`` is only populated on the Wikidata fallback path, since an infobox
    hit never needs to resolve one."""

    query: str
    article: str | None = None
    qid: str | None = None
    genres: list[str] = field(default_factory=list)
    raw_genres: list[str] = field(default_factory=list)

    @property
    def found(self) -> bool:
        return bool(self.genres)


def _get(url: str, params: dict) -> httpx.Response:
    """The single outbound-HTTP seam. Tests monkeypatch this."""
    timeout = _SPARQL_TIMEOUT if url == WIKIDATA_SPARQL else _HTTP_TIMEOUT
    return httpx.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=timeout)


# How many search hits to consider. The right article is not always first --
# "Animal Well" ranks below "Animal Crossing" -- but it has never been far down.
SEARCH_CANDIDATES = 5

# Only an article carrying this template is a video game. It is what rejects
# the Twilight Princess *manga*, and it costs nothing extra: the same wikitext
# request that proves it is a game also carries the genres.
_INFOBOX_VIDEO_GAME = re.compile(r"\{\{\s*Infobox\s+video\s+game", re.IGNORECASE)

# One infobox parameter, ending at the next parameter, at ANY "}}", or at the
# end of the text. Each terminator was found the hard way:
#   - "rest of the line" leaked the following field (Ball x Pit's genre is
#     followed by "| modes = Single-player").
#   - stopping only at the next "|" meant a genre that is the template's last
#     parameter swallowed the article prose after it, so Majora's Mask picked up
#     Japanese title text and "and quality of life changes" as genres.
#   - requiring "}}" at the START of a line missed the very common case of the
#     template closing on the same line as its last value, which swallowed the
#     article lead the same way.
# Matching "}}" anywhere is safe because the closer of an inner template (an
# {{hlist|...}} of genres) ends the value at exactly the right place too.
_INFOBOX_FIELD = r"^\s*\|\s*{field}s?\s*=\s*(.*?)(?=^\s*\|\s*\w|\}}\}}|\Z)"


_LIST_TEMPLATES = re.compile(
    r"\{\{\s*(?:hlist|plainlist|flatlist|ubl|unbulleted list)\s*\|", re.IGNORECASE
)
_PIPED_LINK = re.compile(r"\[\[([^\]|]+)\|([^\]]+)\]\]")
_PLAIN_LINK = re.compile(r"\[\[([^\]]+)\]\]")
_REF = re.compile(r"<ref.*?(?:/>|</ref>)", re.DOTALL)
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_SPLIT = re.compile(r"[,;|]|\*|<br\s*/?>|\n")


# Wikipedia disambiguates with a trailing parenthetical the shelf never uses
# ("Hades (video game)"). Safe to discard for scoring only because candidates
# have already been filtered to video games -- scoring on the raw title is what
# once let "Twilight Princess (manga)" match at 1.0.
_PAREN = re.compile(r"\s*\([^)]*\)\s*$")

# A token that is *entirely* a number or roman numeral, which is how sequels are
# distinguished ("Hades II", "Black Ops 7"). Deliberately not matching mixed
# tokens like "3ds" or "n64", which are platforms rather than series markers --
# excluding those would reject the correct combined article for
# "Super Smash Bros. for Nintendo 3DS and Wii U".
_SERIES_MARKER = re.compile(r"\d+|[ivxlcdm]+")


def _title_similarity(name: str, article: str) -> float:
    """0..1 confidence that ``article`` is the article for ``name``.

    Sequence ratio alone is wrong for the single largest class of correct-but-
    low-scoring matches: Wikipedia covers many games in a **combined** article.
    "Pokemon Violet" -> "Pokémon Scarlet and Violet" scores 0.70 and
    "Super Smash Bros. for Wii U" -> "Super Smash Bros. for Nintendo 3DS and
    Wii U" scores 0.79, both perfectly correct. Meanwhile a wrong entry in a
    series scores *high* ("Black Ops 2" -> "Black Ops 7" at 0.96).

    So when one title's words are wholly contained in the other's, treat it as a
    match -- **unless the leftover words include a bare number or roman
    numeral**, which is precisely how entries in a series are distinguished.
    Without that guard the containment rule is worse than useless: "Hades II" is
    a superset of "Hades", and "Super Smash Bros 4" of "Super Smash Bros.", so
    both wrong answers would score a perfect 1.0. "Persona 5 Royal: Launch
    Edition" over "Persona 5 Royal" leaves only {launch, edition} and stays a
    match, which is the behaviour wanted.
    """
    a, b = _fold(_PAREN.sub("", article)), _fold(name)
    if not a or not b:
        return 0.0
    a_words, b_words = set(a.split()), set(b.split())
    if a_words <= b_words or b_words <= a_words:
        leftover = a_words ^ b_words
        if not any(_SERIES_MARKER.fullmatch(word) for word in leftover):
            return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _rank_key(name: str, article: str):
    """Sort key for choosing among the candidate articles for one game.

    Confidence alone is not enough, because several candidates routinely tie at
    1.0 -- word-containment says yes to any article whose title merely extends
    ours. "Kinect Adventures" matches both "Kinect Adventures!" and "Kinect:
    Disneyland Adventures", and taking the first maximum picked the Disneyland
    game and its "Open world" genre.

    So an exact title wins outright, and a shorter title breaks the remaining
    ties: between two articles that both contain our name, the one that adds
    least is the one that is most likely to *be* it.
    """
    exact = _fold(_PAREN.sub("", article)) == _fold(name)
    return (exact, _title_similarity(name, article), -len(article))


def search_candidates(title: str) -> list[str]:
    """Candidate Wikipedia article titles for a game.

    " video game" is appended to the search terms to bias away from the film or
    album of the same name, which is the common collision for game titles.
    """
    response = _get(
        WIKIPEDIA_API,
        {
            "action": "query",
            "list": "search",
            "srsearch": f"{title} video game",
            "srlimit": SEARCH_CANDIDATES,
            "format": "json",
        },
    )
    response.raise_for_status()
    hits = (response.json().get("query") or {}).get("search") or []
    return [hit["title"] for hit in hits if hit.get("title")]


def lead_sections(titles: list[str]) -> dict[str, str]:
    """Lead-section wikitext for many articles in one request.

    Section 0 is where the infobox lives, so this deliberately does not fetch
    whole articles. Batched because a 155-game library generates several
    hundred candidates, and MediaWiki accepts up to 50 titles at a time.
    """
    if not titles:
        return {}
    response = _get(
        WIKIPEDIA_API,
        {
            "action": "query",
            "titles": "|".join(titles),
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "rvsection": 0,
            "redirects": 1,
            "format": "json",
            "formatversion": 2,
        },
    )
    response.raise_for_status()
    out: dict[str, str] = {}
    for page in (response.json().get("query") or {}).get("pages") or []:
        if page.get("missing"):
            continue
        try:
            out[page["title"]] = page["revisions"][0]["slots"]["main"]["content"]
        except (KeyError, IndexError):
            continue
    return out


def is_video_game(wikitext: str) -> bool:
    return bool(_INFOBOX_VIDEO_GAME.search(wikitext))


def parse_infobox_genres(wikitext: str) -> list[str]:
    """The infobox ``genre`` field, reduced from wiki markup to plain names."""
    match = re.search(
        _INFOBOX_FIELD.format(field="genre"),
        wikitext,
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    if not match:
        return []
    raw = match.group(1)
    raw = _REF.sub("", raw)
    raw = _COMMENT.sub("", raw)
    raw = _LIST_TEMPLATES.sub("", raw)
    raw = raw.replace("}}", "").replace("{{", "")
    # [[Target|Label]] -> Label, then any remaining [[Target]] -> Target.
    raw = _PIPED_LINK.sub(r"\2", raw)
    raw = _PLAIN_LINK.sub(r"\1", raw)
    raw = raw.replace("'''", "").replace("''", "")
    out = []
    for part in _SPLIT.split(raw):
        cleaned = " ".join(part.split()).strip(" .|")
        # An "=" means a stray infobox parameter survived the field split; a
        # very long run is prose, not a genre.
        if cleaned and len(cleaned) < 50 and "=" not in cleaned:
            out.append(cleaned)
    return out[:MAX_GENRES]


_BATCH_QUERY = """
SELECT ?item ?genreLabel WHERE {
  VALUES ?item { %s }
  ?item wdt:P136 ?genre .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""


def genres_for_qids(qids: list[str]) -> dict[str, list[str]]:
    """Raw P136 labels for many Wikidata ids in ONE query.

    Batched via VALUES because WDQS is a shared public endpoint: a 155-game
    library is a handful of requests this way instead of 155, which is the
    difference between a courteous script and a rate-limited one.
    """
    if not qids:
        return {}
    # Only well-formed Q-ids reach the query string; they come from the
    # Wikipedia API, but they are interpolated into SPARQL, so validate rather
    # than trust.
    safe = [q for q in qids if q.startswith("Q") and q[1:].isdigit()]
    if not safe:
        return {}
    values = " ".join(f"wd:{q}" for q in safe)
    response = _get(WIKIDATA_SPARQL, {"query": _BATCH_QUERY % values, "format": "json"})
    response.raise_for_status()
    out: dict[str, list[str]] = {}
    for row in response.json()["results"]["bindings"]:
        # ?item comes back as a full URI; the Q-id is the last path segment.
        qid = row["item"]["value"].rsplit("/", 1)[-1]
        label = row.get("genreLabel", {}).get("value")
        if label:
            out.setdefault(qid, []).append(label)
    return out


# The floor a match must clear to be written to a catalog row unreviewed.
# _title_similarity returns a flat 1.0 for every shape of correct-but-reworded
# article it knows about (combined articles, a missing "The Legend of"), so a
# genuine match rarely lands in the scored band at all, and this mostly decides
# what happens to titles that resolved to something unrelated.
MIN_WRITE_CONFIDENCE = 0.8


def lookup_one(title: str) -> list[str]:
    """Genres for a single title, for the add-game write path. [] on a miss.

    Three differences from lookup_many, all because a user is waiting on the
    POST rather than watching a batch job:

      * No Wikidata fallback. It is the slow leg (a 20s SPARQL ceiling on a
        shared public endpoint) and the least accurate one -- P136 calls The
        Minish Cap a role-playing game. Skipping it bounds this at two requests.
      * Never raises. A third-party miss must not fail an add, so the caller
        gets [] and falls back to what the client sent.
      * A confidence floor. lookup_many ranks candidates against each other and
        returns the best one however bad it is, which is fine for a backfill
        run a human reads afterwards and not fine here: this writes to the
        SHARED catalog row, so one person adding an obscure or misspelled game
        would define wrong genres for everyone who adds it later. Rejecting a
        weak match costs a caller nothing (it falls back to the genres the
        client sent), while accepting one is invisible and sticky, so the
        asymmetry is worth paying for.
    """
    try:
        result = lookup_many([title], wikidata_fallback=False)[title]
    except Exception:
        logger.exception("Genre lookup failed for %r", title)
        return []
    if not result.article:
        return []
    confidence = _title_similarity(title, result.article)
    if confidence < MIN_WRITE_CONFIDENCE:
        logger.info(
            "Rejected low-confidence match for %r: %r scored %.2f",
            title,
            result.article,
            confidence,
        )
        return []
    return result.genres


def lookup_many(
    titles: list[str], *, on_progress=None, wikidata_fallback: bool = True
) -> dict[str, GenreLookup]:
    """Resolve many titles: one Wikipedia search each, then a single batched
    Wikidata query for all the ids found.

    Returns a lookup per input title, including the ones that resolved to
    nothing -- a caller reviewing the results needs to see the misses too.
    """
    results = {title: GenreLookup(query=title) for title in titles}

    # Phase 1: one search per title.
    candidates: dict[str, list[str]] = {}
    for title in titles:
        # Broad on purpose. Beyond connection errors, Wikimedia can serve an
        # HTML error page with a 200 (JSONDecodeError) or a payload missing the
        # keys parsed here (KeyError). One bad title must not abandon a run that
        # is a hundred-odd requests deep.
        try:
            candidates[title] = search_candidates(title)
        except Exception:
            logger.exception("Wikipedia search failed for %r", title)
            candidates[title] = []
        if on_progress:
            on_progress(title, results[title])

    # Phase 2: every candidate article's lead section, 50 at a time. Deduped
    # because sequels and series share candidates constantly.
    unique = sorted({article for hits in candidates.values() for article in hits})
    wikitext: dict[str, str] = {}
    BATCH = 50
    for i in range(0, len(unique), BATCH):
        try:
            wikitext.update(lead_sections(unique[i : i + BATCH]))
        except Exception:
            logger.exception("Wikitext batch %d failed", i)

    # Phase 3: pick the best game candidate and read its infobox.
    for title, hits in candidates.items():
        games = [a for a in hits if is_video_game(wikitext.get(a, ""))]
        if not games:
            continue
        best = max(games, key=lambda a: _rank_key(title, a))
        result = results[title]
        result.article = best
        result.raw_genres = parse_infobox_genres(wikitext[best])
        result.genres = normalize_genres(result.raw_genres)

    # Phase 4: Wikidata only for what the infobox could not answer -- some
    # articles carry the template but leave `genre` empty.
    if wikidata_fallback:
        _fill_gaps_from_wikidata(results)
    return results


def _fill_gaps_from_wikidata(results: dict[str, GenreLookup]) -> None:
    """Backstop for articles whose infobox has no usable genre field."""
    gaps = [r for r in results.values() if r.article and not r.genres]
    if not gaps:
        return
    try:
        qids = _qids_for_articles([r.article for r in gaps if r.article])
    except Exception:
        logger.exception("Wikidata id lookup failed for %d gap articles", len(gaps))
        return
    for result in gaps:
        result.qid = qids.get(result.article or "")
    wanted = [r.qid for r in gaps if r.qid]
    raw_by_qid: dict[str, list[str]] = {}
    BATCH = 50
    for i in range(0, len(wanted), BATCH):
        try:
            raw_by_qid.update(genres_for_qids(wanted[i : i + BATCH]))
        except Exception:
            logger.exception("Wikidata batch %d failed", i)
    for result in gaps:
        if result.qid and result.qid in raw_by_qid:
            result.raw_genres = raw_by_qid[result.qid]
            result.genres = normalize_genres(result.raw_genres)


def _qids_for_articles(articles: list[str]) -> dict[str, str]:
    """Article title -> Wikidata id, batched."""
    out: dict[str, str] = {}
    BATCH = 50
    for i in range(0, len(articles), BATCH):
        response = _get(
            WIKIPEDIA_API,
            {
                "action": "query",
                "titles": "|".join(articles[i : i + BATCH]),
                "prop": "pageprops",
                "ppprop": "wikibase_item",
                "redirects": 1,
                "format": "json",
                "formatversion": 2,
            },
        )
        response.raise_for_status()
        for page in (response.json().get("query") or {}).get("pages") or []:
            qid = (page.get("pageprops") or {}).get("wikibase_item")
            if qid and page.get("title"):
                out[page["title"]] = qid
    return out
