"use client";

// The follow counts in the profile header, doubling as the way into the
// Following / Followers lists.
//
// They live here rather than in the tab strip because they are not another
// slice of the same collection: Played and Want to Play are two views of your
// games, while these list people. Putting them with the handle keeps the strip
// about games and the header about identity. It also costs no new UI, since
// the counts were already on screen.
//
// Client component for one reason: the active state depends on ?view, and
// useSearchParams updates on the client with no server round trip — the same
// arrangement LibraryCount uses, and why both need a Suspense boundary.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { followerLabel } from "@/lib/follows";
import { parseView, type View } from "./libraryConfig";

type FollowCountLinksProps = {
  followerCount: number;
  followingCount: number;
};

// Shared by the links and by the static fallback below, so the two render
// identically apart from the active highlight and there is no layout shift
// when hydration swaps one for the other.
// skip-ink:none because browsers default to auto, which breaks the underline
// around a descender. "following" ends in one, so the gap reads as the rule
// stopping short of the word rather than as a deliberate cut-out.
const BASE =
  "underline underline-offset-2 decoration-shelf-underline transition-colors [text-decoration-skip-ink:none]";
// decoration-2 gives the active state a second signal besides color. Underline
// width rather than font weight, because a heavier label would reflow the row.
const ACTIVE = "text-link decoration-link decoration-2";
// Same accent hover as the view tabs and the Add game / Stats buttons, so every
// interactive thing on this page answers to one color.
const INACTIVE = "hover:text-link hover:decoration-link";

export function FollowCountLinks({ followerCount, followingCount }: FollowCountLinksProps) {
  const pathname = usePathname();
  // An unknown ?view falls back to the default, so neither count shows active.
  const view = parseView(useSearchParams().get("view"));

  // Real anchors rather than the router.replace() the tabs use. These read as
  // "go to this person's followers" — worth a history entry, so Back returns to
  // the shelves, and worth being middle-clickable and deep-linkable. The tabs
  // avoid history entries because toggling filters would flood it.
  //
  // Other params are deliberately not carried over: the people views have no
  // filter or group UI, so a stale ?system= would be unreachable and would then
  // reapply itself on the way back. setView drops them for the same reason.
  function link(target: View, label: string) {
    return (
      <Link
        href={`${pathname}?view=${target}`}
        aria-current={view === target ? "page" : undefined}
        className={`${BASE} ${view === target ? ACTIVE : INACTIVE}`}
      >
        {label}
      </Link>
    );
  }

  return (
    <>
      <span aria-hidden="true"> · </span>
      {link("followers", `${followerCount} ${followerLabel(followerCount)}`)}
      <span aria-hidden="true"> · </span>
      {link("following", `${followingCount} following`)}
    </>
  );
}

// Rendered into the prerendered HTML while the real component waits for
// useSearchParams. Same text and same underline, so the only thing hydration
// changes is which one is highlighted.
export function FollowCountLinksFallback({ followerCount, followingCount }: FollowCountLinksProps) {
  return (
    <>
      <span aria-hidden="true"> · </span>
      <span className={BASE}>
        {followerCount} {followerLabel(followerCount)}
      </span>
      <span aria-hidden="true"> · </span>
      <span className={BASE}>{followingCount} following</span>
    </>
  );
}
