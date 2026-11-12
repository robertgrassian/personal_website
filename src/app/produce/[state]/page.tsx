import type { Metadata } from "next";
import Link from "next/link";
import { caveat } from "@/lib/fonts";
import { notFound } from "next/navigation";
import { ProduceBrowser } from "@/components/produce/ProduceBrowser";
import { ProduceHeading } from "@/components/produce/ProduceHeading";
import { StateSticker } from "@/components/produce/StateSticker";
import { categoriesIn, regionItems } from "@/lib/produce/browse";
import { regionById } from "@/lib/produce/regions";
import { produceStatePath } from "@/lib/produce/resolveState";
import { currentMonth } from "@/lib/produce/season";
import { produceSketch } from "@/lib/produce/sketch";
import { COVERED_STATES, STATES, stateByCode } from "@/lib/produce/states";

// Next route-segment config. All 51 pages are built ahead of time and rebuilt at most hourly,
// which is what moves "this month" forward on a static page. Any other code is a 404 rather than
// an on-demand render.
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return STATES.map((s) => ({ state: s.code.toLowerCase() }));
}

// Next 15 hands params over as a Promise.
type Props = { params: Promise<{ state: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const state = stateByCode((await params).state);
  if (!state) return {};
  return {
    title: `In season in ${state.name}`,
    description: state.region
      ? `The fruit, vegetables and herbs in season in ${state.name} this month, and when each one peaks.`
      : `Season data for ${state.name} is not here yet. See what is in season in the states that have it.`,
    alternates: { canonical: produceStatePath(state.code) },
  };
}

export default async function ProduceStatePage({ params }: Props) {
  const state = stateByCode((await params).state);
  if (!state) notFound();
  const region = state.region ? regionById(state.region) : undefined;
  const sketch = produceSketch();
  const items = region ? regionItems(region, sketch.borders.length) : [];

  return (
    <main className="produce-main">
      <ProduceHeading sketch={sketch} />
      <StateSticker state={state} regionName={region?.name ?? null} sketch={sketch} />

      {region ? (
        <ProduceBrowser
          items={items}
          categories={categoriesIn(items)}
          // Computed at render time in the region's own zone, then frozen into the static HTML
          // until the next revalidation.
          initialMonth={currentMonth(region.timeZone)}
          timeZone={region.timeZone}
          regionName={region.name}
          sketch={sketch}
        />
      ) : (
        <section className="produce-uncovered">
          <p className="text-lg">We don&apos;t have season data for {state.name} yet.</p>
          <p className="mt-2 produce-soft">These states have it:</p>
          <ul className={`produce-state-links ${caveat.className}`}>
            {COVERED_STATES.map((s) => (
              <li key={s.code}>
                <Link href={produceStatePath(s.code)}>{s.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
