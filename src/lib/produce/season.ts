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

// First match wins, which is what keeps every item in exactly one group: a one-month season is
// both arriving and leaving, and lands in "arriving" (or "peak" if it peaks).
export function groupFor(season: string, month: number): GroupId | null {
  const status = statusIn(season, month);
  if (status === "out") return null;
  if (status === "peak") return "peak";
  if (isArriving(season, month)) return "arriving";
  if (isLeaving(season, month)) return "leaving";
  return "around";
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
