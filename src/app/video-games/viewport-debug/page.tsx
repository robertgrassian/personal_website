import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ViewportDebug } from "./ViewportDebug";
import "@/app/video-games/video-games.css";

// Next convention: `metadata` is collected at build time from the route module.
// noindex because this is a tool, not a page anyone should find from a search.
export const metadata: Metadata = {
  title: "Viewport debug",
  description: "Measures how much of the screen a mobile browser's URL bar is covering.",
  robots: { index: false, follow: false },
};

// Preview and local only. VERCEL_ENV is set by Vercel to production, preview or
// development, and is unset off Vercel, so a local `npm run dev` gets the page
// and a production deploy 404s exactly as if the route did not exist.
export default function Page() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <ViewportDebug />;
}
