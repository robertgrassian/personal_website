import type { Metadata } from "next";
import Link from "next/link";
import { caveat } from "@/lib/fonts";
import { ProduceHeading } from "@/components/produce/ProduceHeading";
import { produceStatePath } from "@/lib/produce/resolveState";
import { produceSketch } from "@/lib/produce/sketch";
import { COVERED_STATES, STATES } from "@/lib/produce/states";

// Static. Middleware sends anyone it can place (a cookie, or a US IP) straight to their state, so
// this only renders when it cannot: local dev, outside the US, a VPN. Plain links, so picking here
// sets no cookie; the explicit "Change state" control on a state page is what remembers a choice.
export const metadata: Metadata = {
  title: "What's in season",
  description:
    "The fruit, vegetables and herbs in season where you live, this month and across the year.",
  alternates: { canonical: "/produce" },
};

export default function ProducePickerPage() {
  const others = STATES.filter((s) => s.region === null);
  return (
    <main className="produce-main">
      <ProduceHeading sketch={produceSketch()} />
      <p className="mt-6 text-lg">Pick your state.</p>

      <h2 className="produce-picker-heading">With season data</h2>
      <ul className={`produce-state-links ${caveat.className}`}>
        {COVERED_STATES.map((s) => (
          <li key={s.code}>
            <Link href={produceStatePath(s.code)}>{s.name}</Link>
          </li>
        ))}
      </ul>

      <h2 className="produce-picker-heading">Not covered yet</h2>
      <ul className="produce-state-list">
        {others.map((s) => (
          <li key={s.code}>
            <Link href={produceStatePath(s.code)}>{s.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
