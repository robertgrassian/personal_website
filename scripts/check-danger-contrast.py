"""Contrast of the destructive button on the game detail card.

The card's backdrop is the game's own cover art (blurred, over a per-system
base color, under a black overlay), so it is different for every game and
cannot be checked by eye on one screenshot. This measures the shipped tokens
against representative covers instead.

The fill is deliberately translucent, because the cover reading through the
controls is the look of the card. That is what this exists to keep honest: the
alpha can come down for looks right up until this fails.

Run: python3 scripts/check-danger-contrast.py
Keep in sync with --shelf-danger* on .game-card-surface in
src/app/video-games/video-games.css.
"""

# --shelf-danger-text over --shelf-danger-surface on .game-card-surface, per
# color scheme. Dark mode darkens both the fill and --back-overlay.
TEXT = "#ffffff"
SCHEMES = {
    "light": {"fill": (153, 27, 27), "rest": 0.72, "hover": 0.85, "overlay": 0.25},
    "dark": {"fill": (127, 29, 29), "rest": 0.72, "hover": 0.85, "overlay": 0.35},
}
FLOOR = 4.5  # WCAG AA, normal-size text

# Cover art dominant colors, chosen to span the range rather than to be typical:
# the pale ones are where unaided red text failed, which is why the fill exists.
COVERS = {
    "dark navy": "#1a1a2e",
    "mid grey": "#808080",
    "bright red": "#d32f2f",
    "bright yellow": "#ffd54f",
    "pale cream": "#f5e6c8",
    "deep blue": "#1565c0",
}


def rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def luminance(color):
    def channel(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = color
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(fg, bg):
    a, b = luminance(fg), luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def composite(top, alpha, bottom):
    return tuple(alpha * t + (1 - alpha) * b for t, b in zip(top, bottom, strict=True))


def main():
    text = rgb(TEXT)
    worst = None

    for scheme, cfg in SCHEMES.items():
        print(f"{scheme} scheme")
        print(f"  {'cover':16}{'rest':>8}{'hover':>8}")
        for name, cover in COVERS.items():
            backdrop = composite((0, 0, 0), cfg["overlay"], rgb(cover))
            rest = contrast(text, composite(cfg["fill"], cfg["rest"], backdrop))
            hover = contrast(text, composite(cfg["fill"], cfg["hover"], backdrop))
            worst = min(x for x in (worst, rest, hover) if x is not None)
            print(f"  {name:16}{rest:>8.2f}{hover:>8.2f}")
        print()

    print(f"worst {worst:.2f} against a floor of {FLOOR}")
    if worst < FLOOR:
        raise SystemExit(f"FAIL: {worst:.2f} is below {FLOOR}")
    print("pass")


if __name__ == "__main__":
    main()
