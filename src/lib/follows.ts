// Shared types for the follow graph — no Node.js imports, safe for client and
// server components. Mirrors the API's UserSummary (api/app/schemas/users.py),
// same camelCase-on-the-wire contract as Game and LibraryProfile.

// One row in a follower/following list: enough to link to that user's library.
// No follow counts per row — see the API schema for why.
export type UserSummary = {
  username: string;
  displayName: string;
};
