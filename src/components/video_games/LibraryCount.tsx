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
import { parseView } from "./libraryConfig";

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
  // The people tabs keep the played count rather than dropping the segment.
  // Removing it re-flowed the follow links under the cursor mid-click, and the
  // library's size is still true on those tabs, just not the thing being shown.
  const count = view === "wishlist" ? wishlistCount : playedCount;

  return (
    <>
      <Separator />
      <span>{count} games</span>
    </>
  );
}

// Rendered into the prerendered HTML while the real component waits for
// useSearchParams. The played count is what every view but wishlist shows, so
// the number only changes here if the URL asked for that one tab.
export function LibraryCountFallback({ playedCount }: { playedCount: number }) {
  return (
    <>
      <Separator />
      <span>{playedCount} games</span>
    </>
  );
}
