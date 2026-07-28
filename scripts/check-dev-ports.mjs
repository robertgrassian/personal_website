// Preflight for `npm run dev:full`: refuse to start if either dev port is
// already held.
//
// Without this the failure is silent and misleading. `concurrently` starts
// both halves; whichever port is taken dies with EADDRINUSE while the other
// comes up fine, and the surviving half makes the stack look healthy. The
// symptom that reaches you is "my change didn't take effect" or a 503 from an
// endpoint whose config looks correct, which reads as a code bug.
//
// This has bitten twice: a next-server left over from an earlier session
// serving a stale build on 3000, and a uvicorn started three days before some
// env vars were added still answering on 8000. Both cost real debugging time.
//
// Probes by CONNECTING, not by trying to listen. The listen approach is the
// obvious one and it is wrong here: `next dev` binds the IPv6 wildcard (*:3000)
// while a probe binding 127.0.0.1 gets its own IPv4 socket happily, so the
// check reports "free" with the server plainly running. Connecting asks the
// question we actually mean: is anything answering on this port?
//
// No lsof, so it stays portable and needs no extra dependency.

import { connect } from "node:net";

const PORTS = [
  { port: 3000, what: "Next dev server" },
  { port: 8000, what: "FastAPI (uvicorn)" },
];

function isPortFree(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    const done = (free) => {
      socket.destroy();
      resolve(free);
    };
    // Connected: something is listening.
    socket.once("connect", () => done(false));
    // Refused (or anything else): nothing is answering, so the port is ours.
    socket.once("error", () => done(true));
    // A port that accepts but never completes the handshake would otherwise
    // hang the check; treat a slow answer as occupied.
    socket.setTimeout(1000, () => done(false));
  });
}

const results = await Promise.all(
  PORTS.map(async (entry) => ({ ...entry, free: await isPortFree(entry.port) }))
);
const taken = results.filter((r) => !r.free);

if (taken.length > 0) {
  const lines = taken.map((t) => `  - port ${t.port} (${t.what}) is already in use`);
  console.error(
    [
      "",
      "Refusing to start: a dev port is already held.",
      ...lines,
      "",
      "Something is still running, possibly from an earlier session. If you start",
      "anyway, that half of the stack dies silently and you end up debugging a",
      "stale server: old code, or config it was started too early to see.",
      "",
      "Find it:   lsof -nP -iTCP:3000,8000 -sTCP:LISTEN",
      "Age of it: ps -o lstart=,command= -p <pid>",
      "Stop them: pkill -f next-server; pkill -f 'uvicorn index:app'",
      "",
    ].join("\n")
  );
  process.exit(1);
}
