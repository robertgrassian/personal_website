# Per-user library customization

_Section: Backlog / Ideas_

Let someone style their own library rather than wearing the one the site picks.

## What already exists

Shelf themes shipped with the built-in redesign, so the hard half of this is
done. `ACTIVE_SHELF_THEME` in `src/lib/shelfTheme.ts` picks between two real
implementations:

- **`built-in`** — a walnut bookcase per group, a board per row, in perspective.
  The default.
- **`plain`** — one flat plank per group and a wrapping grid, which is the shelf
  this site shipped for its first year with the wood taken off. Still the better
  answer on a small screen: it is a server component that measures nothing, so
  the whole group arrives in the prerendered HTML.

A theme owns exactly two things: how one group of games is laid out
(`src/components/video_games/shelves/`) and its surface tokens
(`src/app/video-games/shelf-themes.css`). Everything else is shared.

## What is left

1. **A column.** `profiles.shelf_theme`, defaulting to `built-in`, plus a
   migration. Validate against `SHELF_THEMES` on the way in so an unknown value
   cannot reach the CSS.
2. **An API field.** It rides along on the profile the library page already
   fetches, so this adds no round trip.
3. **The read path.** `LibraryPage` stamps `data-shelf-theme` from the profile
   instead of the constant, and `GameShelves` reads the theme from props rather
   than at module scope. Both are one-line changes, deliberately.
4. **A picker**, most likely on `/video-games/account` beside the delete
   control. Preview matters here: the difference is the whole point, so a
   picker that only lists two names is worse than two small live samples.

The constant stays as the fallback for a viewer with no profile, and for the
logged-out demo library.

## Not decided

- Whether the rest of the original idea (hero image, backdrop, featured games)
  belongs to this item or wants its own. Nothing about it is blocked by the
  theme work.
- Whether a theme choice is public — i.e. whether a visitor sees the library in
  the owner's theme or their own. Owner's theme is the obvious reading of
  "customize my library", but it means a visitor cannot opt out of a design.
