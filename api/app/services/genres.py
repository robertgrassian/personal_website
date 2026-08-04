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
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import timedelta

import httpx
from sqlalchemy.orm import Session

from app.services import rate_limit

logger = logging.getLogger(__name__)

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"

# Wikimedia answers 429 to generic User-Agents; their policy asks for a
# descriptive one naming the tool and a contact. A bare httpx default gets this
# rate-limited within a dozen requests.
USER_AGENT = (
    "personal-website-genre-backfill/1.0 "
    "(https://github.com/robertgrassian/personal_website)"
)

_HTTP_TIMEOUT = 30.0
# WDQS is a shared public endpoint and slower than a normal API; a batched
# query over ~40 ids can genuinely take this long.
_SPARQL_TIMEOUT = 90.0

# P136 mixes themes in with genres: Portal 2 carries "post-apocalyptic video
# game" and "science fiction video game" alongside its real genres. Those
# describe setting, not form, and would land in the shelf filter's genre
# dropdown next to "Puzzle". Dropped rather than mapped -- there is no genre
# they correspond to.
THEME_VALUES = frozenset(
    {
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

# Wikidata spells most genres "<genre> video game" ("puzzle video game",
# "role-playing video game"). The library spells them "Puzzle", "RPG". Stripping
# the qualifier is what makes the two vocabularies line up without a per-genre
# alias table.
_QUALIFIER_SUFFIXES = (" video game", " game")

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
    }
)

# WDQS's label service returns the bare Q-id when an item has no English label,
# so an unlabelled genre would otherwise be stored as the literal "Q108919152".
_BARE_QID = re.compile(r"^Q\d+$")

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
        # "Turn-Based") without touching the separators themselves.
        out.append("-".join(seg[:1].upper() + seg[1:] for seg in part.split("-")))
    return " ".join(out)


def normalize_genre(raw: str) -> str | None:
    """One raw Wikidata genre label -> the form stored on a game, or None when
    it should be dropped entirely (a theme, or empty)."""
    value = " ".join(raw.split()).strip()
    if not value:
        return None
    lowered = value.lower()
    if lowered in THEME_VALUES:
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
    return _title_case(value)


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
    """What the cascade found for one title. ``article`` and ``qid`` are kept
    so a backfill can show its work and record the identifiers, making a second
    run exact instead of another fuzzy search."""

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
    return httpx.get(
        url, params=params, headers={"User-Agent": USER_AGENT}, timeout=timeout
    )


# How many search hits to consider. The right article is not always first --
# "Animal Well" ranks below "Animal Crossing" -- but it has never been far down.
SEARCH_CANDIDATES = 5

# Only an article carrying this template is a video game. It is what rejects
# the Twilight Princess *manga*, and it costs nothing extra: the same wikitext
# request that proves it is a game also carries the genres.
_INFOBOX_VIDEO_GAME = re.compile(r"\{\{\s*Infobox\s+video\s+game", re.IGNORECASE)

# One infobox parameter, ending at the next parameter OR at the end of the
# template. Both terminators matter and each was found the hard way: anchoring
# on "rest of the line" leaked the following field (Ball x Pit's genre is
# followed by "| modes = Single-player"), and stopping only at the next "|"
# meant a genre that is the template's LAST parameter swallowed the article
# prose after it -- Majora's Mask picked up Japanese title text and the phrase
# "and quality of life changes" as genres.
_INFOBOX_FIELD = r"^\s*\|\s*{field}s?\s*=\s*(.*?)(?=^\s*\|\s*\w|^\s*\}}\}}|\Z)"

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
_NON_ALNUM = re.compile(r"[^a-z0-9 ]+")

# A token that is *entirely* a number or roman numeral, which is how sequels are
# distinguished ("Hades II", "Black Ops 7"). Deliberately not matching mixed
# tokens like "3ds" or "n64", which are platforms rather than series markers --
# excluding those would reject the correct combined article for
# "Super Smash Bros. for Nintendo 3DS and Wii U".
_SERIES_MARKER = re.compile(r"\d+|[ivxlcdm]+")


def _fold(value: str) -> str:
    """Lowercase, strip accents and punctuation, collapse whitespace.

    Accent folding matters: the shelf says "Pokemon", every Wikipedia article
    says "Pokémon", and without this every Pokémon game loses points for it.
    """
    decomposed = unicodedata.normalize("NFKD", value)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(_NON_ALNUM.sub(" ", stripped.lower()).split())


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
    return out


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


def lookup_many(titles: list[str], *, on_progress=None) -> dict[str, GenreLookup]:
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
        best = max(games, key=lambda a: _title_similarity(title, a))
        result = results[title]
        result.article = best
        result.raw_genres = parse_infobox_genres(wikitext[best])
        result.genres = normalize_genres(result.raw_genres)

    # Phase 4: Wikidata only for what the infobox could not answer -- some
    # articles carry the template but leave `genre` empty.
    _fill_gaps_from_wikidata(results, wikitext)
    return results


def _fill_gaps_from_wikidata(
    results: dict[str, GenreLookup], wikitext: dict[str, str]
) -> None:
    """Backstop for articles whose infobox has no usable genre field."""
    gaps = [r for r in results.values() if r.article and not r.genres]
    if not gaps:
        return
    # The Wikidata id is in the same lead wikitext we already fetched only for
    # some pages, so resolve the handful of gaps by article title instead.
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


# Its own bucket rather than the shared "writes" one: this is a read, and it
# fans out to two free third-party services, so it needs a budget of its own.
# Sized like igdb_search, which the add flow calls immediately before this.
RATE_LIMIT_BUCKET = "genre_lookup"
RATE_LIMIT_MAX = 30
RATE_LIMIT_WINDOW = timedelta(seconds=60)


def lookup_for_user(db: Session, user_id: uuid.UUID, name: str) -> GenreLookup:
    """Genres for one title, on behalf of an authenticated caller.

    Charged before the upstream calls, so a hammering client burns its own
    budget rather than the shared Wikimedia one.
    """
    rate_limit.enforce(
        db,
        user_id,
        RATE_LIMIT_BUCKET,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW,
        f"Too many genre lookups — limited to {RATE_LIMIT_MAX} per minute. "
        "Wait a moment and try again.",
    )
    return lookup_many([name])[name]
