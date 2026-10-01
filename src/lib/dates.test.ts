import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDayShort, formatIsoDate, parseIsoDate } from "./dates.ts";

// The bug these pin: a bare YYYY-MM-DD parsed as local time lands on the
// previous day west of Greenwich. Node reads TZ when it next formats, so
// setting it here keeps the tests honest on a UTC CI runner.
process.env.TZ = "America/Los_Angeles";
test("a bare date parses as midnight UTC on that day", () => {
  assert.equal(parseIsoDate("2026-07-13").toISOString(), "2026-07-13T00:00:00.000Z");
});

test("formatting keeps the day whatever the local timezone", () => {
  assert.equal(formatDayShort("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatIsoDate("2026-01-01", { month: "long", day: "numeric" }), "January 1");
});

test("a caller cannot opt out of the UTC pin", () => {
  assert.equal(
    formatIsoDate("2026-01-01", { month: "short", day: "numeric", timeZone: "Pacific/Honolulu" }),
    "Jan 1"
  );
});
