// Shared types for the follow graph — no Node.js imports, safe for client and
// server components. Mirrors the API's UserSummary (api/app/schemas/users.py),
// same camelCase-on-the-wire contract as Game and LibraryProfile.

// One row in a follower/following list: enough to link to that user's library.
// No follow counts per row — see the API schema for why.
export type UserSummary = {
  username: string;
  displayName: string;
};

// "1 follower" but "0 followers" / "2 followers". Shared because the header
// renders this string twice: once as the interactive link, and once as the
// Suspense fallback that stands in for it during prerender.
export function followerLabel(count: number): string {
  return count === 1 ? "follower" : "followers";
}
