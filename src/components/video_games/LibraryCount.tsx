"use client";

// The library's headline count under the page title. Lives as a client
// component so it can react to the active view (?view) without making the
// whole page dynamic — useSearchParams updates on the client with no server
// round-trip, so switching tabs flips the number instantly.

import { useSearchParams } from "next/navigation";
import { DEFAULT_VIEW, VALID_VIEW, type View } from "./libraryConfig";

type LibraryCountProps = {
  playedCount: number;
  wishlistCount: number;
};

export function LibraryCount({ playedCount, wishlistCount }: LibraryCountProps) {
  // Same validation the URL-state hook uses: fall back to the default view for
  // a missing or malformed ?view value.
  const raw = useSearchParams().get("view");
  const view: View = VALID_VIEW.includes(raw as View) ? (raw as View) : DEFAULT_VIEW;
  const count = view === "wishlist" ? wishlistCount : playedCount;

  return <p className="mt-2 text-shelf-text-muted">{count} games</p>;
}
