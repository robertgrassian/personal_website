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
  followerCount: number;
  followingCount: number;
};

// The public URL of a user's library. Central because it is built in half a
// dozen places (redirects, links, follower rows) and the /video-games prefix
// has moved once already — usernames are user-supplied, so the encode is not
// optional.
export function userLibraryPath(username: string): string {
  return `/video-games/u/${encodeURIComponent(username)}`;
}
