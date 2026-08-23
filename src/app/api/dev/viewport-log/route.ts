// Receives a capture from ViewportRecorder and prints it in the terminal running
// the dev server, so a recording taken on a phone lands where the fix is being
// written. See docs/mobile-viewport.md.
//
// VERCEL, not NODE_ENV: this has to work against a LOCAL production build,
// because React StrictMode double-mounts effects in dev and that difference is
// itself a suspect worth ruling out. Vercel sets VERCEL=1 in every deployed
// environment, so the check means "running on this machine".
export async function POST(request: Request) {
  if (process.env.VERCEL === "1") return new Response("Not found", { status: 404 });

  const body = await request.text();
  console.log("\n===== VIEWPORT CAPTURE =====\n" + body + "\n===== END =====\n");
  return new Response("ok");
}
