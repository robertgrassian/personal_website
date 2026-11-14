// Pure functions over 12-char season strings (January first; `.` out, `a` available, `P` peak,
// `s` from storage). Months are 0..11 throughout.

export type Status = "out" | "available" | "peak" | "storage";

const STATUS_BY_CHAR: Readonly<Record<string, Status>> = {
  ".": "out",
  a: "available",
  P: "peak",
  s: "storage",
};

export function statusIn(season: string, month: number): Status {
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new RangeError(`month must be an integer 0..11, got ${month}`);
  }
  const status = STATUS_BY_CHAR[season[month]];
  if (status === undefined) throw new RangeError(`bad season string "${season}"`);
  return status;
}

// "In" is any character but `.`, storage included: apples from storage still count as around.
function isIn(season: string, month: number): boolean {
  return statusIn(season, month) !== "out";
}

const prev = (month: number) => (month + 11) % 12;
const next = (month: number) => (month + 1) % 12;

export function isArriving(season: string, month: number): boolean {
  return isIn(season, month) && !isIn(season, prev(month));
}

export function isLeaving(season: string, month: number): boolean {
  return isIn(season, month) && !isIn(season, next(month));
}

// The month as the region's own calendar reads it. `getMonth()` would use the runtime's zone,
// which is UTC on the server and the visitor's zone in the browser.
export function currentMonth(timeZone: string, now: Date = new Date()): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric" })
    .formatToParts(now)
    .find((p) => p.type === "month");
  if (part === undefined) throw new Error(`no month part formatting ${now.toISOString()}`);
  return Number(part.value) - 1;
}

export const GROUP_IDS = ["peak", "arriving", "leaving", "around"] as const;
export type GroupId = (typeof GROUP_IDS)[number];

export const GROUP_LABELS: Readonly<Record<GroupId, string>> = {
  peak: "At its peak",
  arriving: "Just arrived",
  leaving: "Last chance",
  around: "Also around",
};

export const SEASON_IDS = ["spring", "summer", "fall", "winter"] as const;
export type SeasonId = (typeof SEASON_IDS)[number];

// Meteorological seasons: whole calendar months, the same in every region. Months are in calendar
// order from the season's start, so winter reads December, January, February across the year end.
export const SEASONS: Readonly<Record<SeasonId, { label: string; months: readonly number[] }>> = {
  spring: { label: "Spring", months: [2, 3, 4] },
  summer: { label: "Summer", months: [5, 6, 7] },
  fall: { label: "Fall", months: [8, 9, 10] },
  winter: { label: "Winter", months: [11, 0, 1] },
};

export function seasonOf(month: number): SeasonId {
  const id = SEASON_IDS.find((s) => SEASONS[s].months.includes(month));
  if (id === undefined) throw new RangeError(`month must be an integer 0..11, got ${month}`);
  return id;
}

// A stretch of months in calendar order, which is what the page groups by: a whole season (three
// months) or one month of it.
export type Period = readonly number[];

// A whole season, or one of its months.
export type View = { season: SeasonId; month: number | null };

export function periodOf(view: View): Period {
  return view.month === null ? SEASONS[view.season].months : [view.month];
}

// First match wins, which is what keeps every item in exactly one group. Over a single month this
// is the original rule. Over a season, "arriving" means the item's run starts inside the period
// and "leaving" that it ends inside it. A run that does both lands in "arriving", and anything
// that peaks at any point stays in "peak": see `endsWithin` for how the end of a run stays
// visible there.
export function groupForPeriod(season: string, period: Period): GroupId | null {
  const present = period.filter((m) => isIn(season, m));
  if (present.length === 0) return null;
  if (period.some((m) => statusIn(season, m) === "peak")) return "peak";
  if (!isIn(season, prev(present[0]))) return "arriving";
  if (!isIn(season, next(present[present.length - 1]))) return "leaving";
  return "around";
}

export function groupFor(season: string, month: number): GroupId | null {
  return groupForPeriod(season, [month]);
}

// The last month of an item's run when it falls inside the period, else null. A peak group hides
// that an item is about to vanish, so the season view says it on the card instead.
export function endsWithin(season: string, period: Period): number | null {
  const present = period.filter((m) => isIn(season, m));
  if (present.length === 0) return null;
  const last = present[present.length - 1];
  return isIn(season, next(last)) ? null : last;
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// "September to November" for a season, "October" for one month.
export function periodRange(period: Period): string {
  const first = MONTH_NAMES[period[0]];
  const last = MONTH_NAMES[period[period.length - 1]];
  return first === last ? first : `${first} to ${last}`;
}

// Contiguous runs of the months in `set`, treating December → January as adjacent. Runs are
// ordered by start month, and a run crossing the year end starts at its true first month.
function runs(set: readonly boolean[]): [number, number][] | "all" {
  if (set.every(Boolean)) return "all";
  const out: [number, number][] = [];
  for (let m = 0; m < 12; m++) {
    if (!set[m] || set[prev(m)]) continue;
    let end = m;
    while (set[next(end)]) end = next(end);
    out.push([m, end]);
  }
  return out;
}

function describeRuns(set: readonly boolean[]): string {
  const r = runs(set);
  if (r === "all") return "all year";
  return r
    .map(([a, b]) => (a === b ? MONTH_NAMES[a] : `${MONTH_NAMES[a]} to ${MONTH_NAMES[b]}`))
    .join(" and ");
}

// The text form of a season strip, so it is never conveyed by colour alone:
// "Peak June to August, available May to September, from storage December to March".
// "Available" covers every fresh month, peak included. It is dropped when it would only repeat
// the peak clause.
export function seasonLabel(season: string): string {
  const statuses = Array.from({ length: 12 }, (_, m) => statusIn(season, m));
  const peak = statuses.map((s) => s === "peak");
  const fresh = statuses.map((s) => s === "peak" || s === "available");
  const storage = statuses.map((s) => s === "storage");

  const clauses: string[] = [];
  if (peak.some(Boolean)) clauses.push(`peak ${describeRuns(peak)}`);
  if (fresh.some(Boolean) && fresh.some((f, m) => f !== peak[m])) {
    clauses.push(`available ${describeRuns(fresh)}`);
  }
  if (storage.some(Boolean)) clauses.push(`from storage ${describeRuns(storage)}`);
  if (clauses.length === 0) return "Out of season all year";

  const text = clauses.join(", ");
  return text[0].toUpperCase() + text.slice(1);
}
