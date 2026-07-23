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
  promoteMyWishlistItem,
  searchIgdb,
  updateMyGameRating,
  updateMyWishlistItem,
  type MutateGameResult,
  type SearchIgdbResult,
} from "@/lib/meApi";
import { libraryCacheTag } from "@/lib/libraryApi";
import { LIBRARY_OWNER_USERNAME, RATINGS, type NewGame, type Rating } from "@/lib/games";
import type { NewWishlistItem } from "@/lib/wishlist";

// The API validates dates for real (parsing, ordering); this only rejects
// obviously malformed input before it leaves the Next server.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidRating(rating: string): rating is Rating | "" {
  return rating === "" || RATINGS.some((r) => r.name === rating);
}

/** Search IGDB for the add-game picker. A read, but it must run server-side:
 *  the browser has no IGDB credentials, and the proxy needs the Bearer token
 *  translation meApi does. No revalidation — nothing changed. */
export async function searchGames(query: string): Promise<SearchIgdbResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 100) {
    return { ok: false, message: "Type at least 2 characters." };
  }
  return searchIgdb(trimmed);
}

/** Add a game to the library (from an IGDB pick or manual entry). */
export async function addGame(game: NewGame): Promise<MutateGameResult> {
  const releaseDateOk = game.releaseDate === null || ISO_DATE_RE.test(game.releaseDate);
  const imageUrlOk = game.imageUrl === "" || game.imageUrl.startsWith("https://images.igdb.com/");
  if (
    game.name.trim() === "" ||
    game.system.trim() === "" ||
    !releaseDateOk ||
    !imageUrlOk ||
    !isValidRating(game.rating) ||
    (game.igdbId !== null && !Number.isInteger(game.igdbId)) ||
    !Array.isArray(game.genres)
  ) {
    return { ok: false, message: "Invalid add request." };
  }

  const result = await createMyGame({
    ...game,
    name: game.name.trim(),
    system: game.system.trim(),
    genres: game.genres.map((g) => g.trim()).filter(Boolean),
  });
  if (result.ok) {
    revalidateTag(libraryCacheTag(LIBRARY_OWNER_USERNAME));
  }
  return result;
}

/** Remove a game from the library; its play sessions cascade away with it. */
export async function deleteGame(gameId: number): Promise<MutateGameResult> {
  if (!Number.isInteger(gameId)) {
    return { ok: false, message: "Invalid delete request." };
  }

  const result = await deleteMyGame(gameId);
  if (result.ok) {
    revalidateTag(libraryCacheTag(LIBRARY_OWNER_USERNAME));
  }
  return result;
}

/** Add a wishlist entry (IGDB pick or manual; only name is required). */
export async function addWishlistItem(item: NewWishlistItem): Promise<MutateGameResult> {
  const releaseDateOk = item.releaseDate === null || ISO_DATE_RE.test(item.releaseDate);
  const imageUrlOk = item.imageUrl === "" || item.imageUrl.startsWith("https://images.igdb.com/");
  if (
    item.name.trim() === "" ||
    !releaseDateOk ||
    !imageUrlOk ||
    !ISO_DATE_RE.test(item.dateAdded) ||
    (item.igdbId !== null && !Number.isInteger(item.igdbId)) ||
    !Array.isArray(item.genres)
  ) {
    return { ok: false, message: "Invalid wishlist request." };
  }

  const result = await createMyWishlistItem({
    ...item,
    name: item.name.trim(),
    system: item.system.trim(),
    genres: item.genres.map((g) => g.trim()).filter(Boolean),
  });
  if (result.ok) {
    revalidateTag(libraryCacheTag(LIBRARY_OWNER_USERNAME));
  }
  return result;
}

/** Edit a wishlist entry — pass only the fields to change. */
export async function updateWishlistItem(
  itemId: number,
  fields: { starred?: boolean; notes?: string; system?: string }
): Promise<MutateGameResult> {
  if (!Number.isInteger(itemId)) {
    return { ok: false, message: "Invalid wishlist request." };
  }

  const result = await updateMyWishlistItem(itemId, fields);
  if (result.ok) {
    revalidateTag(libraryCacheTag(LIBRARY_OWNER_USERNAME));
  }
  return result;
}

/** Remove a wishlist entry. */
export async function deleteWishlistItem(itemId: number): Promise<MutateGameResult> {
  if (!Number.isInteger(itemId)) {
    return { ok: false, message: "Invalid wishlist request." };
  }

  const result = await deleteMyWishlistItem(itemId);
  if (result.ok) {
    revalidateTag(libraryCacheTag(LIBRARY_OWNER_USERNAME));
  }
  return result;
}

/** Promote a wishlist entry into the library ("" system = use the stored one). */
export async function promoteWishlistItem(
  itemId: number,
  system: string
): Promise<MutateGameResult> {
  if (!Number.isInteger(itemId)) {
    return { ok: false, message: "Invalid promote request." };
  }

  const result = await promoteMyWishlistItem(itemId, system.trim());
  if (result.ok) {
    revalidateTag(libraryCacheTag(LIBRARY_OWNER_USERNAME));
  }
  return result;
}

export async function updateGameRating(
  gameId: number,
  rating: Rating | ""
): Promise<MutateGameResult> {
  // Actions are a public HTTP surface (any client can invoke them with any
  // arguments), so re-check the input shape server-side before forwarding.
  // Authorization itself lives in FastAPI — a token for a non-owner gets a 404.
  if (!Number.isInteger(gameId) || !isValidRating(rating)) {
    return { ok: false, message: "Invalid rating request." };
  }

  const result = await updateMyGameRating(gameId, rating);
  if (result.ok) {
    // Purge every cached read (games + wishlist) and re-render the static
    // pages built from them on their next request.
    revalidateTag(libraryCacheTag(LIBRARY_OWNER_USERNAME));
  }
  return result;
}

/** Start playing a game (endDate null → open session) or log a past
 *  playthrough (both dates, inclusive). */
export async function logSession(
  gameId: number,
  startDate: string,
  endDate: string | null
): Promise<MutateGameResult> {
  if (
    !Number.isInteger(gameId) ||
    !ISO_DATE_RE.test(startDate) ||
    (endDate !== null && !ISO_DATE_RE.test(endDate))
  ) {
    return { ok: false, message: "Invalid session request." };
  }

  const result = await createMySession(gameId, startDate, endDate);
  if (result.ok) {
    revalidateTag(libraryCacheTag(LIBRARY_OWNER_USERNAME));
  }
  return result;
}

/** Stop playing: close the open session, optionally rating the game in the
 *  same call (undefined = leave the rating untouched, "" = clear it). */
export async function stopSession(
  sessionId: number,
  endDate: string,
  rating?: Rating | ""
): Promise<MutateGameResult> {
  if (
    !Number.isInteger(sessionId) ||
    !ISO_DATE_RE.test(endDate) ||
    (rating !== undefined && !isValidRating(rating))
  ) {
    return { ok: false, message: "Invalid stop request." };
  }

  const result = await closeMySession(sessionId, endDate, rating);
  if (result.ok) {
    revalidateTag(libraryCacheTag(LIBRARY_OWNER_USERNAME));
  }
  return result;
}
