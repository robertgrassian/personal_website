// Remembers which library belongs to this browser's signed-in viewer, so the
// owner's edit affordances do not wait on a network round trip.
//
// Companion to authFlag.ts, and the same trust model: a COSMETIC hint, not a
// permission. Anyone can write this key by hand; every mutation is still
// authorized server-side in FastAPI against the caller's token. Never gate
// anything that matters on it.
//
// Only the positive answer is cached, and only for the viewer's own library.
// A cached "not following" would put a wrong Follow button on the screen,
// which is a worse lie than a late one — see useViewerRelationship.

const OWNED_LIBRARY_KEY = "vg.owned-library";

// localStorage rather than a cookie: this never needs to reach the server, and
// a cookie would ride on every request to pay for it. Every access is wrapped
// because Safari's private mode throws on access, and a throw here would take
// out the effect that called it.
function readStored(): string | null {
  try {
    return window.localStorage.getItem(OWNED_LIBRARY_KEY);
  } catch {
    return null;
  }
}

// "Has this browser confirmed, on a previous visit, that the signed-in viewer
// owns this library?" False on a cold cache, which is the pre-cache behavior:
// the answer then arrives from /me/relationship as before.
export function isKnownOwnLibrary(ownerUsername: string): boolean {
  return readStored() === ownerUsername;
}

// Called only with an answer the API just gave, so the cache cannot invent one.
export function rememberOwnedLibrary(ownerUsername: string): void {
  try {
    window.localStorage.setItem(OWNED_LIBRARY_KEY, ownerUsername);
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
