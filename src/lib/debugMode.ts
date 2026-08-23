"use client";

import { useEffect, useState } from "react";

// `?debug` turns on the local-only development aids: the viewport recorder, and
// pretending the viewer owns the library so the owner-only fields can be reached
// from a device that cannot sign in (the local Supabase stack listens on
// 127.0.0.1, so no sign-in of any kind completes from another machine).
//
// Whether it is ALLOWED at all is decided on the server and passed in, never
// checked here: `process.env.VERCEL` is not inlined into client bundles, so a
// client-side check reads `undefined` and would enable this on a deploy. Server
// components read it safely; see layout.tsx and LibraryPage.tsx.
//
// Read after mount rather than during render: the server has no query string, so
// deciding during render would make its HTML and the client's first render
// disagree.
export function useDebugMode(allowed: boolean): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    setOn(new URLSearchParams(window.location.search).has("debug"));
  }, [allowed]);

  return on;
}
