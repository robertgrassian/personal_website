import { MONTH_NAMES, groupFor } from "./season.ts";

// One row of GET /me/produce/tastings (api/app/schemas/produce.py).
export type Tasting = { slug: string; year: number; eatenOn: string };

// Mirrors the API's path validation, so a Server Action can refuse a bad slug without a round trip.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 64;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

// Today as YYYY-MM-DD on the region's own calendar. `toISOString()` would give the UTC date,
// which is already tomorrow on a New York evening and files a December 31 tasting under next year.
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

// "June 14". Parsed from the string's own digits: `new Date("2026-06-14")` is UTC midnight, which
// formats as June 13 anywhere west of Greenwich.
export function formatEatenOn(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

// slug → eatenOn. Slugs the catalog does not know are kept and simply never looked up.
export function tastingsBySlug(rows: readonly Tasting[]): Map<string, string> {
  return new Map(rows.map((r) => [r.slug, r.eatenOn]));
}

// How many of a month's in-season items have been tried. Counts the whole region, whatever
// category chip is selected.
export function basketCount(
  items: readonly { slug: string; season: string }[],
  month: number,
  tastings: ReadonlyMap<string, string>
): { tried: number; total: number } {
  let tried = 0;
  let total = 0;
  for (const item of items) {
    if (groupFor(item.season, month) === null) continue;
    total++;
    if (tastings.has(item.slug)) tried++;
  }
  return { tried, total };
}
