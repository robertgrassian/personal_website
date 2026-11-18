import { test } from "node:test";
import assert from "node:assert/strict";
import { REGIONS } from "./regions/index.ts";
import {
  GROUP_IDS,
  GROUP_LABELS,
  MONTH_ABBR,
  SEASONS,
  SEASON_IDS,
  currentMonth,
  groupFor,
  groupForPeriod,
  isArriving,
  isLeaving,
  periodOf,
  periodRange,
  runNote,
  seasonLabel,
  seasonOf,
  statusIn,
} from "./season.ts";

const JAN = 0;
const FEB = 1;
const MAR = 2;
const APR = 3;
const MAY = 4;
const JUN = 5;
const AUG = 7;
const NOV = 10;
const DEC = 11;

const STRAWBERRY = ".....PPa....";
const APPLE = "ssss...aPPPs";
const CITRUS = "PPa.......aP";

test("statusIn reads each character", () => {
  assert.equal(statusIn(STRAWBERRY, JAN), "out");
  assert.equal(statusIn(STRAWBERRY, JUN), "peak");
  assert.equal(statusIn(STRAWBERRY, AUG), "available");
  assert.equal(statusIn(APPLE, FEB), "storage");
});

test("statusIn refuses a month outside 0..11", () => {
  assert.throws(() => statusIn(STRAWBERRY, 12), RangeError);
  assert.throws(() => statusIn(STRAWBERRY, -1), RangeError);
});

test("arriving and leaving inside the year", () => {
  assert.ok(isArriving(STRAWBERRY, JUN));
  assert.ok(!isArriving(STRAWBERRY, AUG));
  assert.ok(isLeaving(STRAWBERRY, AUG));
  assert.ok(!isLeaving(STRAWBERRY, JUN));
  assert.ok(!isArriving(STRAWBERRY, JAN), "out of season is neither");
  assert.ok(!isLeaving(STRAWBERRY, JAN), "out of season is neither");
});

test("wrap-around: citrus arrives in November and leaves in March", () => {
  assert.ok(isArriving(CITRUS, NOV));
  assert.ok(isLeaving(CITRUS, MAR));
  assert.ok(!isArriving(CITRUS, JAN), "December is in, so January is not an arrival");
  assert.ok(!isLeaving(CITRUS, DEC), "January is in, so December is not a departure");
  assert.equal(groupFor(CITRUS, NOV), "arriving");
  assert.equal(groupFor(CITRUS, DEC), "peak");
  assert.equal(groupFor(CITRUS, MAR), "leaving");
  assert.equal(groupFor(CITRUS, JUN), null);
});

test("storage counts as in: apples leave in April, from storage", () => {
  assert.ok(isLeaving(APPLE, APR));
  assert.equal(groupFor(APPLE, APR), "leaving");
  assert.equal(groupFor(APPLE, FEB), "around");
  assert.ok(!isArriving(APPLE, JAN), "December storage carries into January");
});

test("a one-month season is both arriving and leaving, and peak wins the group", () => {
  const peakOnly = "....P.......";
  assert.ok(isArriving(peakOnly, MAY));
  assert.ok(isLeaving(peakOnly, MAY));
  assert.equal(groupFor(peakOnly, MAY), "peak");
  assert.equal(groupFor("....a.......", MAY), "arriving", "arriving beats leaving");
});

test("a year-round item never arrives or leaves", () => {
  const yearRound = "aaaPPPaaasss";
  for (let m = 0; m < 12; m++) {
    assert.ok(!isArriving(yearRound, m));
    assert.ok(!isLeaving(yearRound, m));
    assert.equal(groupFor(yearRound, m), m >= APR && m <= JUN ? "peak" : "around");
  }
});

test("every group has a label", () => {
  assert.deepEqual(Object.keys(GROUP_LABELS).sort(), [...GROUP_IDS].sort());
  assert.equal(GROUP_LABELS.peak, "At its peak");
  assert.equal(GROUP_LABELS.arriving, "Just arrived");
  assert.equal(GROUP_LABELS.leaving, "Last chance");
  assert.equal(GROUP_LABELS.around, "Also around");
});

test("every shipped item is in exactly one group when in season, and none when out", () => {
  for (const region of REGIONS) {
    for (const [slug, season] of Object.entries(region.seasons)) {
      for (let m = 0; m < 12; m++) {
        const group = groupFor(season, m);
        const where = `${region.id} ${slug} month ${m}`;
        if (statusIn(season, m) === "out") {
          assert.equal(group, null, where);
        } else {
          assert.ok(group !== null && GROUP_IDS.includes(group), where);
        }
      }
    }
  }
});

test("currentMonth reads the region's calendar, not UTC", () => {
  const instant = new Date("2026-02-01T07:30:00Z");
  assert.equal(currentMonth("America/Los_Angeles", instant), JAN);
  assert.equal(currentMonth("America/New_York", instant), FEB);
  assert.equal(currentMonth("UTC", instant), FEB);
});

test("currentMonth crosses the year boundary in the region's zone", () => {
  const instant = new Date("2027-01-01T03:00:00Z");
  assert.equal(currentMonth("America/New_York", instant), DEC);
  assert.equal(currentMonth("Europe/London", instant), JAN);
});

test("seasonLabel names peak, the full fresh span, and storage", () => {
  assert.equal(seasonLabel("....aPPPa..."), "Peak June to August, available May to September");
  assert.equal(
    seasonLabel(APPLE),
    "Peak September to November, available August to November, from storage December to April"
  );
});

test("seasonLabel keeps a wrap-around run whole", () => {
  assert.equal(seasonLabel(CITRUS), "Peak December to February, available November to March");
});

test("seasonLabel edge shapes", () => {
  assert.equal(seasonLabel("....P......."), "Peak May", "available would only repeat peak");
  assert.equal(seasonLabel("..aa....aa.."), "Available March to April and September to October");
  assert.equal(seasonLabel("aaaaaaaaaaaa"), "Available all year");
  assert.equal(seasonLabel("PPPPPPPPPPPP"), "Peak all year");
  assert.equal(seasonLabel("......a....."), "Available July");
  assert.equal(seasonLabel(".........sss"), "From storage October to December");
  assert.equal(seasonLabel("............"), "Out of season all year");
});

test("seasonLabel never uses an em dash", () => {
  const shipped = REGIONS.flatMap((r) => Object.values(r.seasons));
  for (const s of [STRAWBERRY, APPLE, CITRUS, "P.P.P.P.P.P.", ...shipped]) {
    assert.ok(!seasonLabel(s).includes("\u2014"), s);
  }
});

test("the four seasons cover every month exactly once, winter crossing the year end", () => {
  const months = SEASON_IDS.flatMap((id) => [...SEASONS[id].months]);
  assert.deepEqual(
    [...months].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  );
  assert.deepEqual(SEASONS.winter.months, [DEC, JAN, FEB]);
  assert.equal(seasonOf(DEC), "winter");
  assert.equal(seasonOf(JAN), "winter");
  assert.equal(seasonOf(MAR), "spring");
  assert.equal(seasonOf(NOV), "fall");
});

test("seasonOf refuses a month outside 0..11", () => {
  assert.throws(() => seasonOf(12), RangeError);
  assert.throws(() => seasonOf(-1), RangeError);
});

test("periodOf is the season's months, or the one month picked", () => {
  assert.deepEqual(periodOf({ season: "fall", month: null }), [8, 9, 10]);
  assert.deepEqual(periodOf({ season: "fall", month: 9 }), [9]);
});

test("a one-month period is exactly groupFor, for every shipped item in every month", () => {
  for (const region of REGIONS) {
    for (const season of Object.values(region.seasons)) {
      for (let m = 0; m < 12; m++) {
        assert.equal(groupForPeriod(season, [m]), groupFor(season, m), `${season} month ${m}`);
      }
    }
  }
});

test("every item in a season is in exactly one group, or none when it is out all season", () => {
  for (const region of REGIONS) {
    for (const season of Object.values(region.seasons)) {
      for (const id of SEASON_IDS) {
        const group = groupForPeriod(season, SEASONS[id].months);
        const anyIn = SEASONS[id].months.some((m) => statusIn(season, m) !== "out");
        assert.equal(group === null, !anyIn, `${season} in ${id}`);
      }
    }
  }
});

test("season groups: arriving, peak, leaving and around", () => {
  const FALL = SEASONS.fall.months;
  // Starts in October: its run begins inside fall.
  assert.equal(groupForPeriod("..........aa", FALL), "arriving");
  // Peaks in October: peak wins whatever else is true.
  assert.equal(groupForPeriod("aaaaaaaaaPaa", FALL), "peak");
  // Runs August to September and stops: the run ends inside fall.
  assert.equal(groupForPeriod(".......aa...", FALL), "leaving");
  // In all of fall and on both sides of it.
  assert.equal(groupForPeriod("aaaaaaaaaaaa", FALL), "around");
  // Out of fall entirely.
  assert.equal(groupForPeriod("..aaaa......", FALL), null);
});

test("winter crosses the year end: citrus is peak, apples are around, strawberries are null", () => {
  const WINTER = SEASONS.winter.months;
  assert.equal(groupForPeriod(CITRUS, WINTER), "peak");
  assert.equal(groupForPeriod(APPLE, WINTER), "around");
  assert.equal(groupForPeriod(STRAWBERRY, WINTER), null);
  // November to January: the run began before winter and stops inside it, across the year end.
  assert.equal(groupForPeriod("a.........aa", WINTER), "leaving");
  // December only: the run starts inside winter.
  assert.equal(groupForPeriod("...........a", WINTER), "arriving");
});

test("runNote names the last month of a run that stops inside the period", () => {
  const SPRING = SEASONS.spring.months;
  // Ramps: April and May, gone in June. A peak, but it ends inside spring.
  assert.equal(runNote("...aP.......", SPRING, null), "Ends in May");
  assert.equal(groupForPeriod("...aP.......", SPRING), "peak");
  // Apples carry on past spring's end from storage.
  assert.equal(runNote(APPLE, SEASONS.fall.months, null), null);
  // Out of season for the whole period: nothing to say.
  assert.equal(runNote(STRAWBERRY, SPRING, null), null);
});

test("runNote knows today: a run already over has ended, one not yet begun starts", () => {
  const FALL = SEASONS.fall.months;
  const PEACH = "......aPP...";
  assert.equal(runNote(PEACH, FALL, NOV), "Ended in September");
  assert.equal(runNote(PEACH, FALL, 8), "Ends in September", "still here in September");
  assert.equal(runNote("..........aa", FALL, 8), "Starts in November");
  assert.equal(runNote("..........aa", FALL, NOV), null, "arrived, and carries on");
  // Winter's months are not in numeric order: January is after December.
  assert.equal(runNote("a.........aa", SEASONS.winter.months, FEB), "Ended in January");
});

test("an item that leaves and comes back inside one season is arriving", () => {
  // In for December and February, out for January.
  assert.equal(groupForPeriod(".aaaaa..aaaa", SEASONS.winter.months), "arriving");
});

test("periodRange reads a season or a single month, in full or short names", () => {
  assert.equal(periodRange(SEASONS.fall.months, MONTH_ABBR), "Sep to Nov");
  assert.equal(periodRange(SEASONS.fall.months), "September to November");
  assert.equal(periodRange(SEASONS.winter.months), "December to February");
  assert.equal(periodRange([MAY]), "May");
});
