// Shared type — no Node.js imports, safe for client and server components.
// Mirrors the API's ProfileRead (api/app/schemas/users.py) field-for-field,
// same camelCase-on-the-wire contract as Game and WishlistGame.

// The public profile behind a library page. Public data only: this payload is
// cached and shared across viewers, so nothing per-viewer belongs here (the
// "is this my library?" question is answered client-side after hydration —
// see useIsLibraryOwner).
export type LibraryProfile = {
  username: string;
  displayName: string;
  // Populated by the API today, but not rendered until Phase 5 gives them a
  // follow button and follower lists to be actionable with.
  followerCount: number;
  followingCount: number;
};
