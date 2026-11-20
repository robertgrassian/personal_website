import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SLUG_PATTERN,
  basketCount,
  formatEatenOn,
  isIsoDate,
  tastingsBySlug,
  todayIn,
  yearOf,
} from "./tastings.ts";
import { CATALOG } from "./catalog.ts";

const JUN = 5;
const DEC = 11;

test("todayIn uses the region's calendar, not UTC", () => {
  // 01:30 UTC on January 1 is still 8:30pm on December 31 in New York.
  const newYearsEveEvening = new Date("2027-01-01T01:30:00Z");
  assert.equal(todayIn("America/New_York", newYearsEveEvening), "2026-12-31");
  assert.equal(todayIn("America/Los_Angeles", newYearsEveEvening), "2026-12-31");
  assert.equal(todayIn("UTC", newYearsEveEvening), "2027-01-01");
});

test("todayIn zero-pads the month and day", () => {
  assert.equal(todayIn("America/New_York", new Date("2026-03-05T17:00:00Z")), "2026-03-05");
});

test("yearOf reads the year the date itself names", () => {
  assert.equal(yearOf("2026-12-31"), 2026);
});

test("formatEatenOn does not shift the day through a time zone", () => {
  assert.equal(formatEatenOn("2026-06-14"), "June 14");
  assert.equal(formatEatenOn("2026-01-01"), "January 1");
  assert.equal(formatEatenOn("2026-12-31"), "December 31");
});

test("isIsoDate accepts only YYYY-MM-DD", () => {
  assert.ok(isIsoDate("2026-06-14"));
  for (const bad of ["2026-6-14", "06/14/2026", "2026-06-14T00:00:00Z", ""]) {
    assert.ok(!isIsoDate(bad), bad);
  }
});

test("every catalog slug passes the pattern the API enforces", () => {
  for (const item of CATALOG) assert.match(item.slug, SLUG_PATTERN);
});

test("basketCount counts only what is in season that month", () => {
  const items = [
    { slug: "strawberry", season: ".....PPa...." },
    { slug: "apple", season: "ssss...aPPPs" },
    { slug: "ramps", season: "...aP......." },
  ];
  const tastings = tastingsBySlug([
    { slug: "strawberry", year: 2026, eatenOn: "2026-06-14" },
    { slug: "ramps", year: 2026, eatenOn: "2026-04-20" },
  ]);
  // June: only strawberries are in. Ramps were tried but are out, so they do not count.
  assert.deepEqual(basketCount(items, [JUN], tastings), { tried: 1, total: 1 });
  // December: only apples (from storage), not yet tried.
  assert.deepEqual(basketCount(items, [DEC], tastings), { tried: 0, total: 1 });
});

test("basketCount over a season counts what is in any of its months", () => {
  const items = [
    { slug: "strawberry", season: ".....PPa...." },
    { slug: "apple", season: "ssss...aPPPs" },
    { slug: "ramps", season: "...aP......." },
  ];
  const tastings = tastingsBySlug([{ slug: "ramps", year: 2026, eatenOn: "2026-04-20" }]);
  const SPRING = [2, 3, 4];
  const SUMMER = [5, 6, 7];
  // Spring: ramps are in; apples are in from storage in March and April; strawberries are not.
  assert.deepEqual(basketCount(items, SPRING, tastings), { tried: 1, total: 2 });
  // Summer: strawberries and apples (August), not ramps.
  assert.deepEqual(basketCount(items, SUMMER, tastings), { tried: 0, total: 2 });
});

test("a tasting for a slug the catalog has dropped is ignored", () => {
  const items = [{ slug: "strawberry", season: ".....PPa...." }];
  const tastings = tastingsBySlug([{ slug: "retired-item", year: 2026, eatenOn: "2026-06-01" }]);
  assert.deepEqual(basketCount(items, [JUN], tastings), { tried: 0, total: 1 });
});
