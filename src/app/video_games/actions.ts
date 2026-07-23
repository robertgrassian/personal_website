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
  createMySession,
  updateMyGameRating,
  type MutateGameResult,
} from "@/lib/meApi";
import { libraryCacheTag } from "@/lib/libraryApi";
import { LIBRARY_OWNER_USERNAME, RATINGS, type Rating } from "@/lib/games";

// The API validates dates for real (parsing, ordering); this only rejects
// obviously malformed input before it leaves the Next server.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidRating(rating: string): rating is Rating | "" {
  return rating === "" || RATINGS.some((r) => r.name === rating);
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
