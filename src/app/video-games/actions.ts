"use server";

// Server Actions for owner edits to the game library. Each action is a thin
// BFF hop: forward the request to FastAPI with the caller's token (via meApi),
// then — only on success — revalidate the cache tags for the resources that
// write actually changed (see the write() helper). revalidateTag()
// can only run on the Next server, which is why writes route through actions
// instead of the browser calling FastAPI directly: the cache invalidation and
// the write must live in the same place.
import { revalidateTag } from "next/cache";
import {
  closeMySession,
  createMyGame,
  createMySession,
  createMyWishlistItem,
  deleteMyAccount,
  deleteMyGame,
  deleteMyWishlistItem,
  fetchMyUsername,
  followUser,
  previewCatalogEntry,
  promoteMyWishlistItem,
  searchIgdb,
  updateMyGame,
  unfollowUser,
  updateMyWishlistItem,
  type CatalogPreviewResult,
  type MutateResult,
  type SearchIgdbResult,
} from "@/lib/meApi";
import {
  followsTag,
  gamesTag,
  getFollowers,
  getFollowing,
  getSessions,
  libraryCacheTag,
  sessionsTag,
  wishlistTag,
} from "@/lib/libraryApi";
import { LIBRARY_OWNER_USERNAME, RATINGS, type NewGame, type Rating } from "@/lib/games";
import type { NewWishlistItem } from "@/lib/wishlist";
import type { PlaySession } from "@/lib/sessions";

/** A cache-tag builder from src/lib/libraryApi: gamesTag, wishlistTag or
 *  followsTag. Writes name the resources they actually changed. */
type TagFor = (username: string) => string;

/** Purge the cached reads for the library the CALLER owns, after a successful
 *  write of theirs.
 *
 *  `tags` names which of the caller's resources this write touched. Naming only
 *  what changed is the point: the five library reads are separately tagged, so a
 *  rating edit costs one refetch rather than five.
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
async function revalidateMyLibrary(tags: TagFor[]): Promise<void> {
  // fetchMyUsername, not fetchMyProfile: same answer, but memoized per user so
  // this doesn't add an API round trip to every single write.
  const username = await fetchMyUsername();
  if (!username) return;
  for (const tag of tags) revalidateTag(tag(username));
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
 *  Case is not a hazard here: the tag builders lowercase, and usernames are
 *  citext, so `RGrassian` and `rgrassian` purge the same tag.
 *
 *  Only followsTag, never the umbrella: a follow cannot change the target's
 *  games or wishlist, so purging those would re-fetch a 155-game library to
 *  reflect a change in a follower count. */
function revalidateOtherLibrary(username: string): void {
  revalidateTag(followsTag(username));
}

// The API validates dates for real (parsing, ordering); this only rejects
// obviously malformed input before it leaves the Next server.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidRating(rating: string): rating is Rating | "" {
  return rating === "" || RATINGS.some((r) => r.name === rating);
}

// Mirrors the `max_length=100` on GameUpdate.system and GameCreate.system
// (api/app/schemas/me.py). Duplicated on purpose: the API stays the real
// bound, this only turns a foreseeable 422 into a readable message.
const MAX_SYSTEM_LENGTH = 100;

/** Run a mutation and, only if the API accepted it, purge the caller's cached
 *  reads for the resources named in `tags`. `alsoRevalidate` names a second
 *  library whose pages this write also changed — only follows need it.
 *
 *  Every write below goes through here rather than repeating the pairing, so
 *  "revalidate if and only if result.ok" is enforced in one place instead of
 *  being restated once per action (where a new action can silently forget it).
 *  The ordering contract revalidateMyLibrary documents is a property of this
 *  function now: it is only ever reached after an accepted write.
 *
 *  `tags` is required rather than defaulted, deliberately. Too narrow a tag
 *  serves a stale page, which surfaces as "the site didn't update" rather than
 *  as an error — so every action is made to state what it changed. */
async function write(
  run: () => Promise<MutateResult>,
  tags: TagFor[],
  alsoRevalidate?: string
): Promise<MutateResult> {
  return writeApplied(async () => ({ result: await run(), applied: false }), tags, alsoRevalidate);
}

/** What a multi-write action did: its overall answer, and whether ANY of its
 *  writes landed. The two come apart only for a partial application, which is
 *  exactly the case a plain `ok` check gets wrong. */
type WriteOutcome = { result: MutateResult; applied: boolean };

/** write() for an action that can half-succeed.
 *
 *  Revalidation is keyed on "did anything land", not on "did everything land".
 *  Keying it on `ok` left a partially-applied Save with a stale cache: the
 *  promote had really moved the row, but the wishlist page kept showing it and
 *  the retry hit a 404 on an item that no longer existed. */
async function writeApplied(
  run: () => Promise<WriteOutcome>,
  tags: TagFor[],
  alsoRevalidate?: string
): Promise<MutateResult> {
  const { result, applied } = await run();
  if (result.ok || applied) {
    // Revalidation runs AFTER the API accepted the write, so nothing it does
    // can undo one. fetchMyUsername → fetchMyProfile throws on an unreachable
    // or unwell API, and letting that escape would reject the Server Action
    // and report an accepted write as a failure — the exact silent-mismatch
    // this file's callers are built to avoid. A stale page until the next
    // revalidation is the correct worst case.
    try {
      await revalidateMyLibrary(tags);
      if (alsoRevalidate !== undefined) revalidateOtherLibrary(alsoRevalidate);
    } catch (err) {
      console.error("Write succeeded but revalidation failed:", err);
    }
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

/** What a picked game's catalog row holds, or would hold if added now: the
 *  genres and release date the add form shows in its info popover but does not
 *  offer as fields.
 *
 *  Server-side for the same reason searchGames is: meApi's session-cookie to
 *  Bearer translation. No revalidation, since nothing changed. */
export async function previewGameCatalog(
  game: NewGame | NewWishlistItem
): Promise<CatalogPreviewResult> {
  const normalized = normalizeSharedFields(game);
  if (normalized === null) {
    return { ok: false, message: "Invalid lookup request." };
  }
  return previewCatalogEntry({
    name: normalized.name,
    igdbId: normalized.igdbId,
    genres: normalized.genres,
    releaseDate: normalized.releaseDate,
  });
}

/** The rows, or a message to put on screen. Not MutateResult, which carries no
 *  data. */
export type PlayHistoryResult =
  | { ok: true; sessions: PlaySession[] }
  | { ok: false; message: string };

/** Read a library's whole play history.
 *
 *  The one READ here, because libraryApi imports server-only and the browser
 *  cannot call it. It takes a username where every write above refuses to: this
 *  data is public, exactly as public as the endpoint behind it.
 *
 *  Errors return a message rather than throwing. getSessions throws loudly by
 *  design, but a panel that fails to load should say so in place instead of
 *  taking the transition down with it. */
export async function getPlayHistory(username: string): Promise<PlayHistoryResult> {
  if (username.trim() === "") return { ok: false, message: "Could not load the play history." };
  try {
    return { ok: true, sessions: await getSessions(username) };
  } catch (err) {
    // Logged server-side where the cause is readable; production replaces
    // action errors with an opaque digest, so the viewer gets the instruction.
    console.error("Loading play history failed:", err);
    return { ok: false, message: "Could not load the play history. Try again." };
  }
}

/** Add a game to the library (from an IGDB pick or manual entry). */
export async function addGame(game: NewGame): Promise<MutateResult> {
  const normalized = normalizeSharedFields(game);
  // A game needs a system and a valid rating on top of the shared fields; a
  // wishlist entry does not, which is why these two stay here.
  if (normalized === null || normalized.system === "" || !isValidRating(game.rating)) {
    return { ok: false, message: "Invalid add request." };
  }

  return write(() => createMyGame(normalized), [gamesTag]);
}

/** Remove a game from the library; its play sessions cascade away with it. */
export async function deleteGame(gameId: number): Promise<MutateResult> {
  return (
    rejectBadId(gameId, "delete") ??
    // sessionsTag too: the cascade deletes this game's sessions.
    write(() => deleteMyGame(gameId), [gamesTag, sessionsTag])
  );
}

/** Add a wishlist entry (IGDB pick or manual; only name is required). */
export async function addWishlistItem(item: NewWishlistItem): Promise<MutateResult> {
  const normalized = normalizeSharedFields(item);
  // dateAdded is wishlist-only: the browser sends its local "today" so the
  // entry isn't stamped with a UTC date the owner never saw.
  if (normalized === null || !ISO_DATE_RE.test(item.dateAdded)) {
    return { ok: false, message: "Invalid wishlist request." };
  }

  return write(() => createMyWishlistItem(normalized), [wishlistTag]);
}

/** Edit a wishlist entry — pass only the fields to change. */
export async function updateWishlistItem(
  itemId: number,
  fields: { starred?: boolean; notes?: string; system?: string }
): Promise<MutateResult> {
  return (
    rejectBadId(itemId, "wishlist") ??
    write(() => updateMyWishlistItem(itemId, fields), [wishlistTag])
  );
}

/** Remove a wishlist entry. */
export async function deleteWishlistItem(itemId: number): Promise<MutateResult> {
  return (
    rejectBadId(itemId, "wishlist") ?? write(() => deleteMyWishlistItem(itemId), [wishlistTag])
  );
}

/** Promote a wishlist entry into the library ("" system = use the stored one).
 *
 *  The one write that purges two of the caller's own tags: promote MOVES a row
 *  between resources, so the wishlist loses an entry and the library gains one.
 *  Tagging it games-only would leave the promoted row visibly still on the
 *  wishlist. */
/** Everything one press of Save can change about a library entry. Every field
 *  is optional and only the present ones are written, so a Save that touched
 *  only the rating still costs one API call. `session` logs a playthrough;
 *  `stopSessionId` closes the open one. */
export type GameEdits = {
  rating?: Rating | "";
  system?: string;
  session?: { startDate: string; endDate: string | null };
  stopSessionId?: number;
  stopDate?: string;
};

/** Which cached reads one Save invalidates. Always games; the history only
 *  when a session was logged or closed, so a rating-only Save does not purge a
 *  list it cannot have changed. */
function sessionEditTags(edits: GameEdits): TagFor[] {
  const touchesSessions = edits.session !== undefined || edits.stopSessionId !== undefined;
  return touchesSessions ? [gamesTag, sessionsTag] : [gamesTag];
}

/** Validate the edits and turn them into the calls that apply them. Shared by
 *  saveGameEdits and promoteAndSave, so a promote carrying a rating obeys
 *  exactly the same rules as an ordinary edit. Null means something is invalid.
 *
 *  Order matters: rating and system land before the session, so a dialog that
 *  both rates and logs cannot end up logged but unrated if one call fails. */
function editCalls(gameId: number, edits: GameEdits): Array<() => Promise<MutateResult>> | null {
  const calls: Array<() => Promise<MutateResult>> = [];

  // Rating and system go in ONE PATCH: GameUpdate takes both, so a Save that
  // changes both can no longer apply one and fail the other. This is also the
  // overwhelmingly common Save, which makes the common case a single call.
  const fields: { rating?: string; system?: string } = {};
  if (edits.rating !== undefined) {
    if (!isValidRating(edits.rating)) return null;
    fields.rating = edits.rating;
  }
  if (edits.system !== undefined) {
    const trimmed = edits.system.trim();
    if (trimmed === "" || trimmed.length > MAX_SYSTEM_LENGTH) return null;
    fields.system = trimmed;
  }
  if (Object.keys(fields).length > 0) calls.push(() => updateMyGame(gameId, fields));
  if (edits.stopSessionId !== undefined) {
    const stopDate = edits.stopDate;
    if (!Number.isInteger(edits.stopSessionId) || stopDate === undefined) return null;
    if (!ISO_DATE_RE.test(stopDate)) return null;
    const sessionId = edits.stopSessionId;
    calls.push(() => closeMySession(sessionId, stopDate));
  }
  if (edits.session !== undefined) {
    const { startDate, endDate } = edits.session;
    if (!ISO_DATE_RE.test(startDate)) return null;
    if (endDate !== null && !ISO_DATE_RE.test(endDate)) return null;
    if (endDate !== null && endDate < startDate) return null;
    calls.push(() => createMySession(gameId, startDate, endDate));
  }
  return calls;
}

/** Run the calls in order, stopping at the first failure.
 *
 *  A partial application is reported as such rather than as a plain failure:
 *  the earlier writes really did land, and saying "that did not work" when half
 *  of it did is how a retry becomes a duplicate. */
async function runInOrder(calls: Array<() => Promise<MutateResult>>): Promise<WriteOutcome> {
  for (let i = 0; i < calls.length; i++) {
    const result = await calls[i]();
    if (!result.ok) {
      return {
        applied: i > 0,
        result: {
          ok: false,
          message:
            i === 0
              ? result.message
              : `${result.message} Your earlier changes were saved, so do not repeat them.`,
        },
      };
    }
  }
  return { result: { ok: true }, applied: calls.length > 0 };
}

/** One press of Save on a library entry. */
export async function saveGameEdits(gameId: number, edits: GameEdits): Promise<MutateResult> {
  const bad = rejectBadId(gameId, "save");
  if (bad) return bad;
  const calls = editCalls(gameId, edits);
  if (calls === null) return { ok: false, message: "Invalid edit." };
  if (calls.length === 0) return { ok: true };
  return writeApplied(() => runInOrder(calls), sessionEditTags(edits));
}

/** One press of Save on a wishlist entry being promoted: the move itself, plus
 *  whatever else the dialog collected on the way through. The system is
 *  required rather than optional because played_games.system is NOT NULL and
 *  the promote is what creates the row.
 *
 *  `session` is optional here, unlike the stop fields: the new row can have a
 *  playthrough logged against it in the same press, but it cannot have an open
 *  one to close. `editCalls` runs it after the row exists, using the id the
 *  promote's 201 returns. */
export async function promoteAndSave(
  itemId: number,
  system: string,
  edits: Omit<GameEdits, "system" | "stopSessionId" | "stopDate">
): Promise<MutateResult> {
  const bad = rejectBadId(itemId, "promote");
  if (bad) return bad;
  const trimmedSystem = system.trim();
  if (trimmedSystem === "" || trimmedSystem.length > MAX_SYSTEM_LENGTH) {
    return { ok: false, message: "Invalid system." };
  }

  // `applied` is true from the moment the promote lands, so every failure below
  // still revalidates: the wishlist row is genuinely gone, and a cache that
  // still shows it sends the retry into a 404 on an item that no longer exists.
  return writeApplied(async () => {
    const promoted = await promoteMyWishlistItem(itemId, trimmedSystem);
    if (!promoted.ok) return { result: { ok: false, message: promoted.message }, applied: false };

    const partial = (rest: string): WriteOutcome => ({
      result: { ok: false, message: `Moved to the library, but ${rest}` },
      applied: true,
    });
    // Nothing else can be applied without the new row id, which only the 201
    // body carries.
    if (promoted.gameId === null) {
      return Object.keys(edits).length > 0
        ? partial("the rest could not be saved. Open it from your library to finish.")
        : { result: { ok: true }, applied: true };
    }
    const calls = editCalls(promoted.gameId, edits);
    if (calls === null) {
      return partial("the rest was invalid. Open it from your library to finish.");
    }
    // The promote landed even when the follow-ups did not.
    return { result: (await runInOrder(calls)).result, applied: true };
    // wishlistTag on top of a normal Save: a promote MOVES a row, so the
    // wishlist loses an entry as the library gains one.
  }, [...sessionEditTags(edits), wishlistTag]);
}

/** Follow a user. Revalidates BOTH libraries: the caller's following list grew
 *  and the target's follower list did too, and each page caches under its own
 *  owner's tag. */
export async function followUserAction(username: string): Promise<MutateResult> {
  if (typeof username !== "string" || username === "") {
    return { ok: false, message: "Invalid follow request." };
  }
  return write(() => followUser(username), [followsTag], username);
}

/** Unfollow a user. Same two-tag revalidation as following. */
export async function unfollowUserAction(username: string): Promise<MutateResult> {
  if (typeof username !== "string" || username === "") {
    return { ok: false, message: "Invalid unfollow request." };
  }
  return write(() => unfollowUser(username), [followsTag], username);
}

/** Delete the caller's account and everything in it.
 *
 *  The one write here that cannot use write(): that helper resolves the
 *  username AFTER the mutation, and by then the profile is gone, so
 *  fetchMyUsername() would return null and nothing would be purged. The
 *  username is read first instead. Doing so does not break fetchMyUsername's
 *  "only after an accepted write" rule, which exists so a forged cookie cannot
 *  choose whose tag gets purged: the value is only USED inside the
 *  `if (result.ok)` below, and a forged cookie's DELETE fails 401 first.
 *
 *  The umbrella tag, not a narrow one: every cached read for this library is
 *  now a 404, so there is no single resource to name.
 *
 *  Does not redirect. The client has to sign out first (the session cookie is
 *  browser state and survives the server-side delete), so navigation is its
 *  call, not ours. */
export async function deleteAccountAction(): Promise<MutateResult> {
  const username = await fetchMyUsername();

  // Read the follow graph BEFORE the delete, for the same reason as the
  // username: the edges are gone afterwards, and these are the people whose
  // pages this delete changes. Both reads are cached under the same tags being
  // purged, and this runs once in an account's lifetime.
  //
  // Failing to read them must not block the delete, so an unreachable API
  // degrades to "purge fewer tags" rather than to "cannot delete your account".
  const neighbors = username
    ? await Promise.all([
        getFollowers(username).catch(() => []),
        getFollowing(username).catch(() => []),
      ])
    : [[], []];

  const result = await deleteMyAccount();
  if (!result.ok) return result;

  if (username) revalidateTag(libraryCacheTag(username));

  // Everyone on either side of a follow edge has a follower count, a following
  // count and two lists that just changed. Purging each one's followsTag is
  // what the API cannot do for us without giving up the 204 that every other
  // DELETE here returns.
  //
  // The founder is in these lists already (signup wires every new account to
  // them in both directions, api/app/services/me.py), but is purged explicitly
  // too: the lists come from a cache that may itself be stale, and the founder's
  // page is the one linked from the homepage. Same hardcoded constant and same
  // reasoning as the mirror case in src/app/onboarding/actions.ts.
  const affected = new Set([LIBRARY_OWNER_USERNAME]);
  for (const user of [...neighbors[0], ...neighbors[1]]) affected.add(user.username);
  for (const name of affected) revalidateTag(followsTag(name));

  return result;
}
