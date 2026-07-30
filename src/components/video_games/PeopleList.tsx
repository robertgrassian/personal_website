// The Following / Followers tab contents: a list of users, each linking to
// their library. Purely presentational — the lists are public data fetched
// server-side with the rest of the page, so this component needs no state and
// no "use client" of its own (it renders inside GameLibrary, which is already
// a client component, but it would work in either).

import Link from "next/link";
import { userLibraryPath } from "@/lib/profile";
import type { UserSummary } from "@/lib/follows";
import type { PeopleView } from "./libraryConfig";

type PeopleListProps = {
  view: PeopleView;
  users: UserSummary[];
  // Whether the viewer owns this library, which only changes the wording of
  // the empty state ("You aren't" vs "This user isn't").
  isOwner: boolean;
};

// Empty-state copy, keyed by tab and ownership. A visitor looking at an empty
// list needs to know it is empty rather than broken; an owner reads the same
// fact as being about them.
const EMPTY_COPY: Record<PeopleView, { owner: string; visitor: string }> = {
  following: {
    owner: "You aren't following anyone yet.",
    visitor: "This user isn't following anyone yet.",
  },
  followers: {
    owner: "Nobody is following you yet.",
    visitor: "This user doesn't have any followers yet.",
  },
};

export function PeopleList({ view, users, isOwner }: PeopleListProps) {
  if (users.length === 0) {
    const copy = EMPTY_COPY[view];
    return (
      <p className="mt-24 text-center text-lg text-shelf-text-muted">
        {isOwner ? copy.owner : copy.visitor}
      </p>
    );
  }

  return (
    <ul className="mt-6 pb-24 flex flex-col gap-2">
      {users.map((user) => (
        <li key={user.username}>
          <Link
            href={userLibraryPath(user.username)}
            className="flex items-baseline gap-2 rounded-md border border-shelf-plank bg-shelf-input px-4 py-3 transition-colors hover:border-link"
          >
            <span className="font-medium text-shelf-text">{user.displayName}</span>
            <span className="text-sm text-shelf-text-muted">@{user.username}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
