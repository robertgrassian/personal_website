"use server";

// Server Actions for owner edits to the game library. Each action is a thin
// BFF hop: forward the request to FastAPI with the caller's token (via meApi),
// then — only on success — revalidate the library cache tag. revalidateTag()
// can only run on the Next server, which is why writes route through actions
// instead of the browser calling FastAPI directly: the cache invalidation and
// the write must live in the same place.
import { revalidateTag } from "next/cache";
import {
  closeMySession,
  createMyGame,
  createMySession,
  createMyWishlistItem,
  deleteMyGame,
  deleteMyWishlistItem,
  fetchMyUsername,
  followUser,
  lookupGenres,
  promoteMyWishlistItem,
  searchIgdb,
  updateMyGameRating,
  unfollowUser,
  updateMyWishlistItem,
  type LookupGenresResult,
  type MutateResult,
  type SearchIgdbResult,
} from "@/lib/meApi";
import { libraryCacheTag } from "@/lib/libraryApi";
import { RATINGS, type NewGame, type Rating } from "@/lib/games";
import type { NewWishlistItem } from "@/lib/wishlist";

/** Purge the cached reads for the library the CALLER owns, after a successful
 *  write of theirs.
 *
 *  The username is resolved from the caller's own token, never taken as an
 *  argument: Server Actions are a public HTTP surface, so a username parameter
 *  would let anyone invalidate anyone else's cache. Every write below targets
 *  /me/* endpoints, which act on the authenticated user's rows — so "whose
 *  library changed?" always has exactly this answer.
 *
 *  A missing profile is not an error here: the write already succeeded, so the
 *  worst case is a stale page until the next revalidation.
 *
 *  CALL THIS ONLY AFTER A WRITE THE API ACCEPTED — every call site below is
 *  inside an `if (result.ok)`. fetchMyUsername trusts an unverified cookie on
 *  a cache hit, and that succeeded write is what proves the session real. */
async function revalidateMyLibrary(): Promise<void> {
  // fetchMyUsername, not fetchMyProfile: same answer, but memoized per user so
  // this doesn't add an API round trip to every single write.
  const username = await fetchMyUsername();
  if (username) revalidateTag(libraryCacheTag(username));
}

/** Purge the cached reads for ANOTHER user's library, after a write of ours
 *  changed something on their page.
 *
 *  Only follows need this. Every other write in this file touches one library —
 *  the caller's — but a follow moves two numbers and two lists: the caller's
 *  following count and list, and the target's follower count and list. Passing
 *  the target's tag to revalidateMyLibrary()'s rules is impossible, since it
 *  deliberately refuses to take a username.
 *
 *  Taking the username as an argument is the thing revalidateMyLibrary warns
 *  about, so the difference matters: the caller's tag decides whose PRIVATE
 *  writes get published, while this one only forces a re-fetch of a page that
 *  is already public to everyone. No data leaks either way.
 *
 *  It is still a cache-purge primitive, not merely "a re-request": toggling
 *  follow on one username at the write budget's ceiling (60/min, rate_limit_
 *  writes) purges that tag twice that often, and each purge costs a full
 *  re-render plus four API round trips. Bounded rather than harmless — it needs
 *  a session, is rate-limited, and signup is capped — but worth naming so the
 *  next person weighing a client-supplied tag has the real number.
 *
 *  Case is not a hazard here: libraryCacheTag lowercases, and usernames are
 *  citext, so `RGrassian` and `rgrassian` purge the same tag. */
function revalidateOtherLibrary(username: string): void {
  revalidateTag(libraryCacheTag(username));
}

// The API validates dates for real (parsing, ordering); this only rejects
// obviously malformed input before it leaves the Next server.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidRating(rating: string): rating is Rating | "" {
  return rating === "" || RATINGS.some((r) => r.name === rating);
}

/** Run a mutation and, only if the API accepted it, purge the caller's cached
 *  reads. `alsoRevalidate` names a second library whose pages this write also
 *  changed — only follows need it.
 *
 *  Every write below goes through here rather than repeating the pairing, so
 *  "revalidate if and only if result.ok" is enforced in one place instead of
 *  being restated once per action (where a new action can silently forget it).
 *  The ordering contract revalidateMyLibrary documents is a property of this
 *  function now: it is only ever reached after an accepted write. */
async function write(
  run: () => Promise<MutateResult>,
  alsoRevalidate?: string
): Promise<MutateResult> {
  const result = await run();
  if (result.ok) {
    await revalidateMyLibrary();
    if (alsoRevalidate !== undefined) revalidateOtherLibrary(alsoRevalidate);
  }
  return result;
}

/** Reject a row id that isn't an integer before it leaves the Next server.
 *  Returns the refusal to hand straight back, or null when the id is fine. */
function rejectBadId(id: number, what: string): MutateResult | null {
  return Number.isInteger(id) ? null : { ok: false, message: `Invalid ${what} request.` };
}

// The fields NewGame and NewWishlistItem have in common — the ones an IGDB pick
// fills in. Both add paths validate and normalize them identically, so the
// https://images.igdb.com/ check and the date shape live here once rather than
// being two copies that can be tightened apart.
type SharedEntryFields = {
  name: string;
  system: string;
  genres: string[];
  releaseDate: string | null;
  imageUrl: string;
  igdbId: number | null;
};

/** Null when the shared fields are malformed; otherwise the entry with those
 *  fields trimmed and its blank genres dropped. */
function normalizeSharedFields<T extends SharedEntryFields>(entry: T): T | null {
  const releaseDateOk = entry.releaseDate === null || ISO_DATE_RE.test(entry.releaseDate);
  const imageUrlOk = entry.imageUrl === "" || entry.imageUrl.startsWith("https://images.igdb.com/");
  if (
    entry.name.trim() === "" ||
    !releaseDateOk ||
    !imageUrlOk ||
    (entry.igdbId !== null && !Number.isInteger(entry.igdbId)) ||
    !Array.isArray(entry.genres)
  ) {
    return null;
  }
  return {
    ...entry,
    name: entry.name.trim(),
    system: entry.system.trim(),
    genres: entry.genres.map((g) => g.trim()).filter(Boolean),
  };
}

/** Search IGDB for the add-game picker. A read, but it must run server-side:
 *  the browser has no IGDB credentials, and the proxy needs the Bearer token
 *  translation meApi does. No revalidation — nothing changed. */
export async function searchGames(query: string, page = 1): Promise<SearchIgdbResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { ok: false, message: "Type at least 2 characters." };
  }
  // The API caps `q` at 100 too; saying so beats one message for both bounds.
  if (trimmed.length > 100) {
    return { ok: false, message: "Search term is too long (100 characters max)." };
  }
  // A Server Action is a public HTTP endpoint, so a nonsense page is rejected
  // here rather than sent on as an opaque 422. The upper bound is deliberately
  // not repeated: the API owns it, and answers with hasMore: false at the cap.
  if (!Number.isInteger(page) || page < 1) {
    return { ok: false, message: "No more results to show." };
  }
  return searchIgdb(trimmed, page);
}

/** Genres for a picked game, from Wikipedia/Wikidata. Server-side for the same
 *  reason as searchGames: the Bearer token translation lives in meApi. No
 *  revalidation — this only fills in a form the user hasn't submitted yet. */
export async function lookupGameGenres(name: string): Promise<LookupGenresResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, message: "No game name to look up." };
  }
  // Matches the API's own Query(max_length=200) bound.
  if (trimmed.length > 200) {
    return { ok: false, message: "Game name is too long (200 characters max)." };
  }
  return lookupGenres(trimmed);
}

/** Add a game to the library (from an IGDB pick or manual entry). */
export async function addGame(game: NewGame): Promise<MutateResult> {
  const normalized = normalizeSharedFields(game);
  // A game needs a system and a valid rating on top of the shared fields; a
  // wishlist entry does not, which is why these two stay here.
  if (normalized === null || normalized.system === "" || !isValidRating(game.rating)) {
    return { ok: false, message: "Invalid add request." };
  }

  return write(() => createMyGame(normalized));
}

/** Remove a game from the library; its play sessions cascade away with it. */
export async function deleteGame(gameId: number): Promise<MutateResult> {
  return rejectBadId(gameId, "delete") ?? write(() => deleteMyGame(gameId));
}

/** Add a wishlist entry (IGDB pick or manual; only name is required). */
export async function addWishlistItem(item: NewWishlistItem): Promise<MutateResult> {
  const normalized = normalizeSharedFields(item);
  // dateAdded is wishlist-only: the browser sends its local "today" so the
  // entry isn't stamped with a UTC date the owner never saw.
  if (normalized === null || !ISO_DATE_RE.test(item.dateAdded)) {
    return { ok: false, message: "Invalid wishlist request." };
  }

  return write(() => createMyWishlistItem(normalized));
}

/** Edit a wishlist entry — pass only the fields to change. */
export async function updateWishlistItem(
  itemId: number,
  fields: { starred?: boolean; notes?: string; system?: string }
): Promise<MutateResult> {
  return rejectBadId(itemId, "wishlist") ?? write(() => updateMyWishlistItem(itemId, fields));
}

/** Remove a wishlist entry. */
export async function deleteWishlistItem(itemId: number): Promise<MutateResult> {
  return rejectBadId(itemId, "wishlist") ?? write(() => deleteMyWishlistItem(itemId));
}

/** Promote a wishlist entry into the library ("" system = use the stored one). */
export async function promoteWishlistItem(itemId: number, system: string): Promise<MutateResult> {
  return (
    rejectBadId(itemId, "promote") ?? write(() => promoteMyWishlistItem(itemId, system.trim()))
  );
}

export async function updateGameRating(gameId: number, rating: Rating | ""): Promise<MutateResult> {
  // Actions are a public HTTP surface (any client can invoke them with any
  // arguments), so re-check the input shape server-side before forwarding.
  // Authorization itself lives in FastAPI — a token for a non-owner gets a 404.
  if (!Number.isInteger(gameId) || !isValidRating(rating)) {
    return { ok: false, message: "Invalid rating request." };
  }

  // On success this purges every cached read (games + wishlist) and re-renders
  // the static pages built from them on their next request.
  return write(() => updateMyGameRating(gameId, rating));
}

/** Start playing a game (endDate null → open session) or log a past
 *  playthrough (both dates, inclusive). */
export async function logSession(
  gameId: number,
  startDate: string,
  endDate: string | null
): Promise<MutateResult> {
  if (
    !Number.isInteger(gameId) ||
    !ISO_DATE_RE.test(startDate) ||
    (endDate !== null && !ISO_DATE_RE.test(endDate))
  ) {
    return { ok: false, message: "Invalid session request." };
  }

  return write(() => createMySession(gameId, startDate, endDate));
}

/** Stop playing: close the open session, optionally rating the game in the
 *  same call (undefined = leave the rating untouched, "" = clear it). */
export async function stopSession(
  sessionId: number,
  endDate: string,
  rating?: Rating | ""
): Promise<MutateResult> {
  if (
    !Number.isInteger(sessionId) ||
    !ISO_DATE_RE.test(endDate) ||
    (rating !== undefined && !isValidRating(rating))
  ) {
    return { ok: false, message: "Invalid stop request." };
  }

  return write(() => closeMySession(sessionId, endDate, rating));
}

/** Follow a user. Revalidates BOTH libraries: the caller's following list grew
 *  and the target's follower list did too, and each page caches under its own
 *  owner's tag. */
export async function followUserAction(username: string): Promise<MutateResult> {
  if (typeof username !== "string" || username === "") {
    return { ok: false, message: "Invalid follow request." };
  }
  return write(() => followUser(username), username);
}

/** Unfollow a user. Same two-tag revalidation as following. */
export async function unfollowUserAction(username: string): Promise<MutateResult> {
  if (typeof username !== "string" || username === "") {
    return { ok: false, message: "Invalid unfollow request." };
  }
  return write(() => unfollowUser(username), username);
}
