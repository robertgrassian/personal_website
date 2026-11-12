import { stateByCode } from "./states.ts";

// Pure, so the middleware's decision is testable without a request. Shared with the Server Action
// that writes the cookie, so the two cannot disagree on its name.
export const PRODUCE_STATE_COOKIE = "produce_state";

// 400 days is the ceiling Chrome enforces on any cookie's lifetime.
export const PRODUCE_STATE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export function produceStatePath(code: string): string {
  return `/produce/${code.toLowerCase()}`;
}

type ResolveInput = {
  // The produce_state cookie, written only when the visitor picks a state themselves.
  cookie: string | undefined;
  // x-vercel-ip-country and x-vercel-ip-country-region. Absent locally and off Vercel.
  country: string | null;
  region: string | null;
};

// The uppercase state code to send /produce to, or null to render the picker.
// Any valid state resolves, covered or not: the uncovered page is where the links to covered
// states are, and it is honest about the gap.
export function resolveProduceState({ cookie, country, region }: ResolveInput): string | null {
  // An explicit pick beats a guess from the IP.
  if (cookie) {
    const picked = stateByCode(cookie);
    if (picked) return picked.code;
  }
  if (country?.toUpperCase() === "US" && region) {
    const located = stateByCode(region);
    if (located) return located.code;
  }
  return null;
}
