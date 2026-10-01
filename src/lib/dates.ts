// Formatting for the API's bare ISO dates ("2026-07-13"). Every formatter goes
// through here because the parse needs a UTC pin: a bare YYYY-MM-DD read as
// local time shifts a day backwards west of Greenwich.

/** Midnight UTC on the given day. */
export function parseIsoDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

/** toLocaleDateString in en-US, pinned to UTC so the day never shifts. */
export function formatIsoDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  return parseIsoDate(iso).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

/** "Jul 2, 2026": the compact form lists and meta rows use. */
export function formatDayShort(iso: string): string {
  return formatIsoDate(iso, { month: "short", day: "numeric", year: "numeric" });
}
