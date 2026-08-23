import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { KeyboardLab } from "./KeyboardLab";

// Not on the production deploy, where this route is a 404. VERCEL_ENV rather
// than NODE_ENV so a PR's preview deployment still serves it, which is the only
// way to try this on a phone without running a dev server: a preview builds with
// NODE_ENV=production and would otherwise 404 too.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function KeyboardLabPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <KeyboardLab />;
}
