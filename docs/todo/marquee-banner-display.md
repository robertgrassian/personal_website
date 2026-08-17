# Alternate "currently playing" display: Marquee Banner

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Option 2 from the mockups: a full-width banner using the game's blurred cover as the backdrop (the
same recipe as `GameCaseBack`: dominant color base, blurred art, dark overlay), the sharp cover on
the left, and system/genre chips plus "last played" on the right.

_How to build it._ As a sibling of `CurrentlyPlaying`, taking the same `Game` prop, with a
display-mode switch (a config const, or a URL param for fun) to swap between the CRT and the
marquee.

Mockups: https://claude.ai/code/artifact/2e891385-8fc9-4c9b-b8da-469658de243d
