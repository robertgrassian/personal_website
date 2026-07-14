#!/usr/bin/env python3
"""Fixture tests for wikipedia.parse_infobox().

Pure — no network. Run with:  python3 .claude/tools/test_wikipedia.py
Exits 0 if all assertions pass, 1 otherwise.
"""

from wikipedia import parse_infobox

# A trimmed but realistic {{Infobox video game}} body. Exercises the tricky
# cases: a nested {{vgrelease}} template (brace-depth matching), [[wikilinks]]
# with and without labels, and <br> separators inside a field.
FIXTURE = """{{Short description|2017 video game}}
{{Infobox video game
| title = Hollow Knight
| developer = [[Team Cherry]]
| genre = [[Metroidvania]], [[Action-adventure game|Action-adventure]]
| platforms = [[Microsoft Windows|Windows]]<br>[[Nintendo Switch]]
| released = {{vgrelease|WW=February 24, 2017|NA=February 24, 2017}}
| modes = [[Single-player video game|Single-player]]
}}
'''Hollow Knight''' is a 2017 [[Metroidvania]] game.
"""


def check(condition, message):
    if not condition:
        print(f"FAIL: {message}")
        return False
    print(f"ok:   {message}")
    return True


def main():
    result = parse_infobox(FIXTURE)
    passed = True

    passed &= check(
        result.get("genre") == "Metroidvania, Action-adventure",
        f"genre cleaned & wikilinks stripped (got {result.get('genre')!r})",
    )
    passed &= check(
        result.get("platforms") == "Windows, Nintendo Switch",
        f"platforms: <br> -> comma, labels resolved (got {result.get('platforms')!r})",
    )
    passed &= check(
        "NA=February 24, 2017" in result.get("released_raw", ""),
        "released_raw keeps template markup for NA-date extraction",
    )
    passed &= check(
        "}}" not in result.get("released_raw", "").split("NA=")[-1][:20]
        or "vgrelease" in result.get("released_raw", ""),
        "brace-depth matching captured the nested {{vgrelease}} template",
    )

    # A page with no video-game infobox should be reported, not crash.
    passed &= check(
        parse_infobox("Just some prose, no infobox here.") == {"error": "no_infobox"},
        "missing infobox returns {'error': 'no_infobox'}",
    )

    print("\nALL PASSED" if passed else "\nSOME FAILED")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
