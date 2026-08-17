"use client";

// The library's headline count. Lives as a client component so it can react to
// the active view (?view) without making the whole page dynamic —
// useSearchParams updates on the client with no server round-trip, so switching
// tabs flips the number instantly.
//
// Renders inline into the handle line rather than as its own block, which is
// why it is a <span> carrying its own separator: nesting a <p> inside the
// handle's <p> is invalid HTML, and an inline fragment lets the whole identity
// line collapse to one row. Same shape as FollowCountLinks, which shares that
// line.

import { useSearchParams } from "next/navigation";
import { isGameView, parseView } from "./libraryConfig";

type LibraryCountProps = {
  playedCount: number;
  wishlistCount: number;
};

// Matches FollowCountLinks' separator so the three segments read as one list.
function Separator() {
  return <span aria-hidden="true"> · </span>;
}

export function LibraryCount({ playedCount, wishlistCount }: LibraryCountProps) {
  const view = parseView(useSearchParams().get("view"));
  // Nothing to headline on a people tab: the profile header states both follow
  // counts permanently, so repeating one here would just say it twice.
  if (!isGameView(view)) return null;
  const count = view === "wishlist" ? wishlistCount : playedCount;

  return (
    <>
      <Separator />
      <span>{count} games</span>
    </>
  );
}

// Rendered into the prerendered HTML while the real component waits for
// useSearchParams. The played count is the default view's, so the number only
// changes here if the URL asked for a different tab.
export function LibraryCountFallback({ playedCount }: { playedCount: number }) {
  return (
    <>
      <Separator />
      <span>{playedCount} games</span>
    </>
  );
}
