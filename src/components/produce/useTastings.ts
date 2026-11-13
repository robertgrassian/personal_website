"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { markTasting, unmarkTasting } from "@/app/produce/actions";
import { API_PREFIX } from "@/lib/apiPrefix";
import type { MutateResult } from "@/lib/meApi";
import { tastingsBySlug, todayIn, yearOf, type Tasting } from "@/lib/produce/tastings";
import { createClient } from "@/lib/supabase/client";

// `loading` is the initial state on the server and in the browser alike, so nothing stamped
// renders until the answer is in. `error` is a failed read: the UI must not offer "I ate this"
// then, because a write over an unseen row would replace its date.
export type TastingsStatus = "signed-out" | "loading" | "ready" | "error";

export type Tastings = {
  status: TastingsStatus;
  // slug → eatenOn (YYYY-MM-DD), for the current year in the region's zone.
  tastings: ReadonlyMap<string, string>;
  // Slugs with a write in flight.
  pending: ReadonlySet<string>;
  // The last failed write's message, until the next write or clearError.
  error: string | null;
  clearError: () => void;
  mark: (slug: string) => void;
  unmark: (slug: string) => void;
};

const NONE: ReadonlyMap<string, string> = new Map();
const NOT_PENDING: ReadonlySet<string> = new Set();
const READ_TIMEOUT_MS = 10_000;

// The one place tastings are read or written. Components never fetch, so a second backend (device
// storage for guests) could sit behind this without touching them.
//
// The read goes straight from the browser to the API with the session's JWT, because the page is
// static and identical for every viewer. Writes go through Server Actions like every owner write.
export function useTastings(timeZone: string): Tastings {
  const [status, setStatus] = useState<TastingsStatus>("loading");
  const [tastings, setTastings] = useState(NONE);
  const [pending, setPending] = useState(NOT_PENDING);
  const [error, setError] = useState<string | null>(null);

  // Refs mirror state for the async callbacks below, which would otherwise read the values
  // captured when they were created.
  const tastingsRef = useRef(tastings);
  tastingsRef.current = tastings;
  const pendingRef = useRef(new Set<string>());
  // Bumped whenever the signed-in user changes. A response or rollback that started under an
  // earlier value belongs to someone else's session and is dropped.
  const generation = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    // undefined until the first event, so the first answer always registers as a change.
    let userId: string | null | undefined;
    let unmounted = false;
    const stale = (mine: number) => unmounted || mine !== generation.current;

    async function load(token: string, mine: number) {
      try {
        const year = yearOf(todayIn(timeZone));
        // Relative URL: the API prefix is same-origin in dev and prod, so no CORS.
        const res = await fetch(`${API_PREFIX}/me/produce/tastings?year=${year}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: AbortSignal.timeout(READ_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = (await res.json()) as Tasting[];
        if (stale(mine)) return;
        setTastings(tastingsBySlug(rows));
        setStatus("ready");
      } catch {
        if (!stale(mine)) setStatus("error");
      }
    }

    // Fires once on subscribe (INITIAL_SESSION) with the cookie session, then on every sign-in,
    // sign-out and token refresh, including ones made in another tab.
    //
    // The callback stays synchronous and does not await: supabase-js holds a lock while it runs.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user.id ?? null;
      // A token refresh re-announces the same user. Refetching would blank the stamps hourly.
      if (nextId === userId) return;
      userId = nextId;
      const mine = ++generation.current;

      pendingRef.current.clear();
      setPending(NOT_PENDING);
      setTastings(NONE);
      setError(null);
      if (!session) {
        setStatus("signed-out");
        return;
      }
      setStatus("loading");
      void load(session.access_token, mine);
    });

    return () => {
      subscription.unsubscribe();
      unmounted = true;
    };
  }, [timeZone]);

  // Optimistic: the stamp changes at once and is put back if the server refuses. Done by hand
  // rather than with React's useOptimistic, which reverts to server-rendered state when its
  // transition ends; this state lives only in the browser, so there is nothing to revert to.
  const write = useCallback(
    async (slug: string, next: string | undefined, call: () => Promise<MutateResult>) => {
      // One write per item at a time, so a rollback cannot undo a later tap.
      if (pendingRef.current.has(slug)) return;
      const mine = generation.current;
      const previous = tastingsRef.current.get(slug);

      const put = (value: string | undefined) =>
        setTastings((current) => {
          const copy = new Map(current);
          if (value === undefined) copy.delete(slug);
          else copy.set(slug, value);
          return copy;
        });

      pendingRef.current.add(slug);
      setPending(new Set(pendingRef.current));
      setError(null);
      put(next);

      // A Server Action rejects, rather than resolving to a result, when the request itself fails.
      const result = await call().catch(
        (): MutateResult => ({
          ok: false,
          message: "Couldn't reach the server. Check your connection and try again.",
        })
      );
      if (mine !== generation.current) return;

      if (!result.ok) {
        put(previous);
        setError(result.message);
      }
      pendingRef.current.delete(slug);
      setPending(new Set(pendingRef.current));
    },
    []
  );

  const mark = useCallback(
    (slug: string) => {
      // The date is the browser's reading of the region's calendar. The server cannot supply it.
      const eatenOn = todayIn(timeZone);
      void write(slug, eatenOn, () => markTasting(slug, eatenOn));
    },
    [timeZone, write]
  );

  const unmark = useCallback(
    (slug: string) => {
      const eatenOn = tastingsRef.current.get(slug);
      if (eatenOn === undefined) return;
      // The stored date's year, not today's: the row to delete is keyed by the year it was eaten.
      void write(slug, undefined, () => unmarkTasting(yearOf(eatenOn), slug));
    },
    [write]
  );

  const clearError = useCallback(() => setError(null), []);

  return { status, tastings, pending, error, clearError, mark, unmark };
}
