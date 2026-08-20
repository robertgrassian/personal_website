// Remembers which library belongs to this browser's signed-in viewer, so the
// owner's edit affordances do not wait on a network round trip.
//
// Companion to authFlag.ts, and the same trust model: a COSMETIC hint, not a
// permission. Anyone can write this key by hand; every mutation is still
// authorized server-side in FastAPI against the caller's token. Never gate
// anything that matters on it — and note that "authorized" is not "aimed":
// POST /me/games has no existing row to check against, so it always writes to
// the CALLER's library. The affordance that opens it must therefore be gated
// on the answer being right, not just on the write being safe.
//
// Only the positive answer is cached, and only for the viewer's own library.
// A cached "not following" would put a wrong Follow button on the screen,
// which is a worse lie than a late one — see useViewerRelationship.

const OWNED_LIBRARY_KEY = "vg.owned-library";

// The account the answer belongs to rides along with it. Keyed by username
// alone, the entry outlived the session that earned it: signing in as someone
// else fires SIGNED_IN, never a sign-out, so a stale username would put the
// owner's controls on a stranger's library.
type OwnedLibrary = { username: string; userId: string };

// localStorage rather than a cookie: this never needs to reach the server, and
// a cookie would ride on every request to pay for it. Every access is wrapped
// because Safari's private mode throws on access, and a throw here would take
// out the effect that called it.
function readStored(): OwnedLibrary | null {
  try {
    const raw = window.localStorage.getItem(OWNED_LIBRARY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // Hand-edited or written by an older shape: treat as absent rather than
    // trusting half an answer.
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as OwnedLibrary).username !== "string" ||
      typeof (parsed as OwnedLibrary).userId !== "string"
    ) {
      return null;
    }
    return parsed as OwnedLibrary;
  } catch {
    return null;
  }
}

// "Has this browser confirmed, on a previous visit, that the signed-in viewer
// owns this library?" False on a cold cache, which is the pre-cache behavior:
// the answer then arrives from /me/relationship as before.
//
// Reads the username only, so it stays synchronous: the session id is not
// available without an await, and forgetForOtherUser below is what keeps the
// entry from surviving into another account.
export function isKnownOwnLibrary(ownerUsername: string): boolean {
  return readStored()?.username === ownerUsername;
}

// Called only with an answer the API just gave, so the cache cannot invent one.
export function rememberOwnedLibrary(ownerUsername: string, userId: string): void {
  try {
    const entry: OwnedLibrary = { username: ownerUsername, userId };
    window.localStorage.setItem(OWNED_LIBRARY_KEY, JSON.stringify(entry));
  } catch {
    // Storage full or blocked: the affordances just resolve late, as before.
  }
}

// Sign-out, and any answer that contradicts the cache. Cheap to call when
// there is nothing stored.
export function forgetOwnedLibrary(): void {
  try {
    window.localStorage.removeItem(OWNED_LIBRARY_KEY);
  } catch {
    // Nothing to do: a stale entry costs one frame of pencils that the next
    // /me/relationship answer takes away again.
  }
}

// Drops an entry earned by a different account. Called on every auth state
// change, because switching users replaces the session without ever reporting
// one absent.
export function forgetOwnedLibraryForOtherUser(userId: string): void {
  const stored = readStored();
  if (stored && stored.userId !== userId) forgetOwnedLibrary();
}
