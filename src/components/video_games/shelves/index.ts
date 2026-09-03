// The seam between the library and the shelf it is drawn on.
//
// Everything above this line is shared by every theme: the filter/group/sort
// pipeline, the sticky chrome, GameCase and its badges, the detail card and its
// flight. A theme decides one thing only — how a single group of games is laid
// out, and what furniture (if any) is around it.
//
// Adding a theme is: a component here, a token block in shelf-themes.css, and a
// name in src/lib/shelfTheme.ts.

import type { ComponentType } from "react";
import type { ShelfThemeName } from "@/lib/shelfTheme";
import type { GameCaseInput } from "../GameCase";
import { BuiltInGroup } from "./BuiltInGroup";
import { PlainGroup } from "./PlainGroup";

export type ShelfGroupProps = {
  // The group's name: a system, a genre, a decade, or "" when grouping is off,
  // in which case a theme renders no heading at all.
  label: string;
  // Game[] and WishlistGame[] both fit via structural typing — no union needed.
  games: GameCaseInput[];
};

export const SHELF_GROUPS: Record<ShelfThemeName, ComponentType<ShelfGroupProps>> = {
  "built-in": BuiltInGroup,
  plain: PlainGroup,
};
