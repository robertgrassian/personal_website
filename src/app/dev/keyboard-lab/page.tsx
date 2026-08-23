import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { KeyboardLab } from "./KeyboardLab";

// Development only. In production this route is a 404, so it is not something
// anyone else can reach: to use it, run `npm run dev` and open the Network URL
// it prints on a phone on the same wifi.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function KeyboardLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KeyboardLab />;
}
