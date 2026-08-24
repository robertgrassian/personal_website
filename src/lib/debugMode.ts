"use client";

import { useEffect, useState } from "react";

// `?debug` turns on the development aids: the viewport recorder (local only),
// and pretending the viewer owns the library so the owner-only fields can be
// reached from a device that cannot sign in (the local Supabase stack listens on
// 127.0.0.1, so no sign-in of any kind completes from another machine). Preview
// deploys allow the ownership override too, on the owner's own library only,
// which is why `allowed` is a per-library value that can change on a client
// navigation rather than a constant for the life of the page.
//
// Whether it is ALLOWED at all is decided on the server and passed in, never
// checked here: neither `process.env.VERCEL` nor `VERCEL_ENV` is inlined into
// client bundles, so a client-side check reads `undefined` and would enable this
// in production. Server components read them safely; see layout.tsx for the
// recorder and LibraryPage.tsx for the ownership override.
//
// Read after mount rather than during render: the server has no query string, so
// deciding during render would make its HTML and the client's first render
// disagree.
export function useDebugMode(allowed: boolean): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    // Recomputed, never early-returned, when `allowed` goes false: it is a
    // per-library value, and navigating between two /video-games/u/[username]
    // pages reconciles this component instead of remounting it (see the same
    // hazard in useViewerRelationship). A stale `true` would follow the viewer
    // onto someone else's shelf.
    setOn(allowed && new URLSearchParams(window.location.search).has("debug"));
  }, [allowed]);

  return on;
}
