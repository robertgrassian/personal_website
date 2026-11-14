"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthButton } from "@/components/AuthButton";
import { MenuItem } from "@/components/ui/MenuItem";
import { caveat } from "@/lib/fonts";
import type { ProduceItem } from "@/lib/produce/browse";
import { CATEGORY_LABELS } from "@/lib/produce/categories";
import type { ProduceCategory } from "@/lib/produce/types";
import {
  GROUP_IDS,
  GROUP_LABELS,
  MONTH_NAMES,
  SEASONS,
  currentMonth,
  endsWithin,
  groupForPeriod,
  periodOf,
  seasonOf,
  type GroupId,
  type Period,
  type SeasonId,
  type View,
} from "@/lib/produce/season";
import type { ProduceSketch } from "@/lib/produce/sketch";
import { UNDERLINE_VIEWBOX } from "@/lib/produce/sketchBoxes";
import { basketCount } from "@/lib/produce/tastings";
import { PeriodPicker } from "./PeriodPicker";
import { RoughFrame } from "./RoughFrame";
import { SeedPacket } from "./SeedPacket";
import { SeasonKey } from "./SeasonStrip";
import { ProduceDetail } from "./ProduceDetail";
import { useTastings, type Tastings } from "./useTastings";

type Filter = "all" | ProduceCategory;

type Props = {
  items: ProduceItem[];
  categories: ProduceCategory[];
  // Computed by the server render in the region's zone. See the effect below for why it can lag.
  initialMonth: number;
  timeZone: string;
  regionName: string;
  sketch: ProduceSketch;
};

// "this fall", "this month", "in spring", "in October": the real season or month reads as "this".
function whenLabel(view: View, nowMonth: number): string {
  if (view.month !== null) {
    return view.month === nowMonth ? "this month" : `in ${MONTH_NAMES[view.month]}`;
  }
  const label = SEASONS[view.season].label.toLowerCase();
  return view.season === seasonOf(nowMonth) ? `this ${label}` : `in ${label}`;
}

// "You've tried 7 of the 31 things in season this fall." Counts the whole region for the period
// on show, ignoring the category chip, and always against this year's tastings.
function basketLine(
  tracking: Tastings,
  items: readonly ProduceItem[],
  period: Period,
  when: string
): string {
  if (tracking.status === "error") {
    return "Couldn't load what you've tried. Refresh the page to try again.";
  }
  // A non-breaking space holds the line's height while the read is out, so the groups below do
  // not jump when the sentence arrives.
  if (tracking.status !== "ready") return "\u00a0";
  const { tried, total } = basketCount(items, period, tracking.tastings);
  if (total === 0) return "\u00a0";
  return `You've tried ${tried} of the ${total} ${total === 1 ? "thing" : "things"} in season ${when}.`;
}

export function ProduceBrowser({
  items,
  categories,
  initialMonth,
  timeZone,
  regionName,
  sketch,
}: Props) {
  // Initialised from the server's prop, never from the browser clock: the first client render has
  // to produce the same HTML the server did, or React reports a hydration mismatch.
  // Opens on the whole current season: the month is the drill-down underneath it.
  const [view, setView] = useState<View>({ season: seasonOf(initialMonth), month: null });
  const [nowMonth, setNowMonth] = useState(initialMonth);
  const [filter, setFilter] = useState<Filter>("all");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  // A ref, not state: whether the visitor has scrubbed never affects what renders, only whether
  // the effect may move the scrubber, so changing it should not re-render.
  const touched = useRef(false);
  // Called once, here, and handed down: one read and one optimistic state for cards and dialog.
  const tracking = useTastings(timeZone);

  // ISR serves a stale page to the first visitor after it expires, so a page last built on the
  // 30th can arrive on the 1st showing last month. Effects run only after hydration, so
  // correcting here cannot cause a mismatch. A visitor who has already scrubbed keeps their pick.
  useEffect(() => {
    const now = currentMonth(timeZone, new Date());
    if (now === initialMonth) return;
    setNowMonth(now);
    if (!touched.current) setView({ season: seasonOf(now), month: null });
  }, [timeZone, initialMonth]);

  const pickSeason = (season: SeasonId) => {
    touched.current = true;
    setView({ season, month: null });
  };
  const pickMonth = (month: number | null) => {
    touched.current = true;
    setView((v) => ({ season: v.season, month }));
  };
  const backToNow = () => pickSeason(seasonOf(nowMonth));

  const period = useMemo(() => periodOf(view), [view]);
  const when = whenLabel(view, nowMonth);
  const showingNow = view.season === seasonOf(nowMonth) && view.month === null;

  // Group once per period/filter change rather than on every render (opening the dialog
  // re-renders this component too).
  const groups = useMemo(() => {
    const byGroup = new Map<GroupId, ProduceItem[]>(GROUP_IDS.map((g) => [g, []]));
    for (const item of items) {
      if (filter !== "all" && item.category !== filter) continue;
      const group = groupForPeriod(item.season, period);
      if (group) byGroup.get(group)!.push(item);
    }
    return GROUP_IDS.map((id) => ({ id, items: byGroup.get(id)! })).filter((g) => g.items.length);
  }, [items, filter, period]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const open = openSlug ? items.find((i) => i.slug === openSlug) : undefined;
  const filterLabel = filter === "all" ? null : CATEGORY_LABELS[filter];

  return (
    <>
      <section aria-label="Season and month" className="mt-8">
        <PeriodPicker
          view={view}
          nowMonth={nowMonth}
          sketch={sketch}
          onSeason={pickSeason}
          onMonth={pickMonth}
        />
        <p className="produce-count" aria-live="polite">
          <span>
            {filterLabel ?? "Everything"} in season {when}: {total}
          </span>
          {!showingNow && (
            <button type="button" className="produce-back" onClick={backToNow}>
              Back to {SEASONS[seasonOf(nowMonth)].label.toLowerCase()}
            </button>
          )}
        </p>
      </section>

      <div role="group" aria-label="Show" className="produce-chips">
        {(["all", ...categories] as Filter[]).map((c) => (
          <button
            key={c}
            type="button"
            className="produce-chip"
            aria-pressed={filter === c}
            onClick={() => setFilter(c)}
          >
            {c === "all" ? "All" : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <SeasonKey />

      {/* Both halves are in the static HTML for every visitor. The pre-paint data-authed flag and
          the data-hide-* rules in globals.css drop the one that does not apply, so neither
          flashes. */}
      <section aria-label="Your basket" className="produce-basket">
        <p data-hide-anon="">{basketLine(tracking, items, period, when)}</p>
        <p data-hide-authed="">Sign in to keep track of what you&apos;ve eaten this year.</p>
        <div className="produce-account">
          <MenuItem href="/account" data-hide-anon="">
            Account
          </MenuItem>
          <AuthButton />
        </div>
      </section>

      {groups.length === 0 ? (
        <p className="produce-empty">
          {filterLabel ? `No ${filterLabel.toLowerCase()}` : "Nothing"} in season {when}. Try
          another season or month.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.id} aria-labelledby={`group-${group.id}`} className="mt-10">
            <h2 id={`group-${group.id}`} className={`produce-group-heading ${caveat.className}`}>
              {GROUP_LABELS[group.id]}
              <span className="produce-group-count">{group.items.length}</span>
              <RoughFrame
                d={sketch.underline}
                viewBox={UNDERLINE_VIEWBOX}
                className="produce-underline"
              />
            </h2>
            <ul className="produce-grid">
              {group.items.map((item) => (
                <li key={item.slug}>
                  <SeedPacket
                    item={item}
                    period={period}
                    // A peak group hides that a run is ending, so a season says so on the card. A
                    // single month has no need: its groups already say it.
                    endsIn={period.length > 1 ? endsWithin(item.season, period) : null}
                    sketch={sketch}
                    tried={tracking.tastings.has(item.slug)}
                    onOpen={setOpenSlug}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Mounted only while open: ModalShell's chrome runs on mount and cleans up on unmount. */}
      {open && (
        <ProduceDetail
          item={open}
          period={period}
          regionName={regionName}
          glyph={sketch.glyphs[open.category]}
          ring={sketch.circle}
          tracking={tracking}
          onClose={() => {
            // A failed write's message belongs to the dialog it happened in.
            tracking.clearError();
            setOpenSlug(null);
          }}
        />
      )}
    </>
  );
}
