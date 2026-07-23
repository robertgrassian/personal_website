"use server";

// Server Actions for owner edits to the game library. Each action is a thin
// BFF hop: forward the request to FastAPI with the caller's token (via meApi),
// then — only on success — revalidate the library cache tag. revalidateTag()
// can only run on the Next server, which is why writes route through actions
// instead of the browser calling FastAPI directly: the cache invalidation and
// the write must live in the same place.
import { revalidateTag } from "next/cache";
import { updateMyGameRating, type MutateGameResult } from "@/lib/meApi";
import { libraryCacheTag } from "@/lib/libraryApi";
import { LIBRARY_OWNER_USERNAME, RATINGS, type Rating } from "@/lib/games";

export async function updateGameRating(
  gameId: number,
  rating: Rating | ""
): Promise<MutateGameResult> {
  // Actions are a public HTTP surface (any client can invoke them with any
  // arguments), so re-check the input shape server-side before forwarding.
  // Authorization itself lives in FastAPI — a token for a non-owner gets a 404.
  if (!Number.isInteger(gameId) || (rating !== "" && !RATINGS.some((r) => r.name === rating))) {
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
