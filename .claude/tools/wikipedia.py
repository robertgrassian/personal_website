#!/usr/bin/env python3
"""Wikipedia lookup helpers for the add-game skill.

Two subcommands, each does its own HTTP and prints JSON to stdout:

    python3 wikipedia.py search "Hollow Knight"
        -> ["Hollow Knight", "Hollow Knight: Silksong", ...]

    python3 wikipedia.py infobox "Hollow Knight"
        -> {"genre": "...", "platforms": "...", "released_raw": "..."}

`released_raw` is intentionally left un-cleaned: it may contain template
markup like {{vgrelease|NA=...|EU=...}}, and the skill needs the raw form to
pick the North America date.

The parse_infobox() function is pure (wikitext string in, dict out) so it can
be unit-tested against a fixture without any network access.
"""

import json
import re
import subprocess
import sys
import urllib.parse

API = "https://en.wikipedia.org/w/api.php"
# Wikipedia asks API clients to identify themselves via User-Agent.
USER_AGENT = "personal_website-add-game/1.0 (https://github.com/robertgrassian/personal_website)"


def _get_json(params):
    """GET the MediaWiki API with the given query params and return parsed JSON.

    We shell out to `curl` rather than use urllib: the python.org build of
    Python on macOS ships without a CA bundle, so urllib's TLS verification
    fails, whereas curl uses the system keychain and just works.
    """
    url = API + "?" + urllib.parse.urlencode(params)
    proc = subprocess.run(
        ["curl", "-sS", "-H", f"User-Agent: {USER_AGENT}", url],
        capture_output=True,
        text=True,
        timeout=20,
        check=True,
    )
    return json.loads(proc.stdout)


def search(name):
    """Return up to 5 page titles matching a game name, best match first."""
    data = _get_json({
        "action": "query",
        "list": "search",
        "srsearch": f"{name} video game",
        "srlimit": 5,
        "format": "json",
    })
    return [r["title"] for r in data["query"]["search"]]


def _fetch_wikitext(title):
    """Return the raw wikitext of a page's current revision."""
    data = _get_json({
        "action": "query",
        "titles": title,
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "format": "json",
    })
    pages = data["query"]["pages"]
    page = next(iter(pages.values()))
    return page["revisions"][0]["slots"]["main"]["*"]


def _clean(s):
    """Strip common wikitext markup down to plain, comma-separated text."""
    # [[target|label]] -> label
    s = re.sub(r"\[\[[^\]]*\|([^\]]+)\]\]", r"\1", s)
    # [[label]] -> label
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)
    # <br> variants -> comma separators
    s = re.sub(r"<br\s*/?>", ", ", s, flags=re.IGNORECASE)
    # drop any remaining HTML tags
    s = re.sub(r"<[^>]+>", "", s)
    return s.strip()


def _extract_field(field, text):
    """Pull a single `| field = value` value out of an infobox template body.

    Scans forward from `| field =` with a {{ }} brace-depth counter, so a
    value that contains nested templates (e.g.
    {{collapsible list|title={{nobold|...}}|...}} or {{Unbulleted list|...}})
    is captured whole. A naive "stop at the first `}}` or newline-pipe" match
    truncates such values mid-template — the inner `}}` or a pipe-separated
    list item inside the template looks like the end of the field.

    The value ends, at brace depth 0, at either the next `| field =` line or
    the `}}` that closes the infobox itself.
    """
    m = re.search(r"\|\s*" + re.escape(field) + r"\s*=\s*", text, re.IGNORECASE)
    if not m:
        return ""

    start = m.end()
    depth, i = 0, start
    while i < len(text):
        if text[i:i + 2] == "{{":
            depth += 1
            i += 2
        elif text[i:i + 2] == "}}":
            if depth == 0:
                # Closing braces of the infobox itself; the value ends here.
                break
            depth -= 1
            i += 2
        elif depth == 0 and text[i] == "\n":
            # A newline that begins the next `| field =` line ends the value.
            j = i + 1
            while j < len(text) and text[j] in " \t":
                j += 1
            if j < len(text) and text[j] == "|":
                break
            i += 1
        else:
            i += 1

    return text[start:i].strip()


def parse_infobox(wikitext):
    """Extract genre/platforms/released from a page's {{Infobox video game}}.

    Pure function: no network. Returns a dict, or {"error": "no_infobox"} if
    the page has no video-game infobox. `genre` and `platforms` are cleaned;
    `released_raw` is left as-is for downstream NA-date extraction.
    """
    start = wikitext.lower().find("{{infobox video game")
    if start == -1:
        return {"error": "no_infobox"}

    # Walk the template with a brace-depth counter so nested {{...}} templates
    # inside the infobox don't confuse where it ends.
    depth, i, end = 0, start, -1
    while i < len(wikitext):
        if wikitext[i:i + 2] == "{{":
            depth += 1
            i += 2
        elif wikitext[i:i + 2] == "}}":
            depth -= 1
            if depth == 0:
                end = i + 2
                break
            i += 2
        else:
            i += 1

    infobox = wikitext[start:end] if end > -1 else wikitext[start:]

    return {
        "genre": _clean(_extract_field("genre", infobox)),
        "platforms": _clean(_extract_field("platforms", infobox)),
        "released_raw": _extract_field("released", infobox),
    }


def infobox(title):
    """Fetch a page and return its parsed infobox fields."""
    wikitext = _fetch_wikitext(title)
    return parse_infobox(wikitext)


def main(argv):
    if len(argv) < 2:
        print("usage: wikipedia.py {search|infobox} <arg>", file=sys.stderr)
        return 2

    command, arg = argv[0], argv[1]
    if command == "search":
        result = search(arg)
    elif command == "infobox":
        result = infobox(arg)
    else:
        print(f"unknown command: {command}", file=sys.stderr)
        return 2

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
