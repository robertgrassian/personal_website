// The one place the frontend spells out where the FastAPI backend lives.
// Mirrors API_PREFIX in api/app/core/config.py, and must agree with the
// rewrite in next.config.ts and the matcher exclusion in src/middleware.ts.
//
// Deliberately its own module rather than living in libraryApi.ts: that file
// imports "server-only", and useViewerRelationship.ts needs this constant from
// the browser.
//
// The second segment exists because /api is contested — Vercel routes it to the
// Python function, Next.js claims it for its own Route Handlers — so one subtree
// has to be named as ours. It names the app rather than the runtime (it was
// "/api/py" until 2026-08-18): a URL saying "python" becomes a lie the day the
// backend is rewritten, and clients cannot be made to forget it.
export const API_PREFIX = "/api/library";

// The prefix this API answered on before 2026-08-18. Nothing serves it any
// more: it names what the PREVIOUSLY DEPLOYED production is still answering on
// while the rename ships.
//
// Read only by libraryApi.ts, and only while PRERENDERING. A build fetches from
// the API that is currently DEPLOYED, so the build that ships the rename asks a
// production that has not got the new prefix yet. Without that retry the build
// fails, so the new API never deploys, so the next build fails the same way: a
// deadlock, not a transient error. Dead the moment the rename is live in prod.
export const LEGACY_API_PREFIX = "/api/py";
