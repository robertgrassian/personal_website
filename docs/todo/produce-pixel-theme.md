# A Stardew-style "pixel farm" look for the produce page, as a toggle beside the Field guide look

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Wanted as a "would be cool one day", not planned. Robert picked the Field guide look with USDA watercolor plates for Phase 5 and liked this one a lot as the runner-up (2026-11-13).

_What was mocked._ Wood-framed parchment menus, season tabs like the game's inventory tabs, inventory-slot cards, a "Fall 13" date plaque, a segmented energy-bar basket, a red check badge for tried items. Night mode is dusk. The font was Pixelify Sans. Used for headings only in production: pixel type at body size fails the legibility and contrast checks.

_Why it is a toggle and not a swap._ The page's structure (season picker, month row, chips, basket, groups, cards, detail dialog) is the same in both looks. Treat it the way `CLAUDE.md` treats the shelf: a theme owns only the surface tokens, the chrome and the art, and the data, the `browse.ts` grouping and the components are shared. That means the Field guide work should not hard-code its look into component logic. Components carry structure and a `data-` hook; `produce.css` carries the look.

_The art caveat that needs a ruling first._ The pixel sprites in the mock were shape recipes (an ellipse with light and dark pixels, an auto outline) that the assistant drafted, about 5 lines per item. They need no sourcing or licence, but the spec rules out AI art "in any form", so whether code-recipes drafted by an assistant count is Robert's call. The real USDA plates do not carry over: they are watercolors.

_Cost, so it can be weighed._ Biggest rework of the three looks mocked: a new font, new frame and bevel tokens, sprite recipes for every item, and nothing from the rough.js chrome carries over. The persisted choice would be a cookie or a column, which is the same question as **Per-user library customization**.

Related: **Produce tracker at `/produce`**, **Per-user library customization**.
