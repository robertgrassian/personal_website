import { test } from "node:test";
import assert from "node:assert/strict";
import { REGIONS } from "./regions/index.ts";
import {
  GROUP_IDS,
  GROUP_LABELS,
  currentMonth,
  groupFor,
  isArriving,
  isLeaving,
  seasonLabel,
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
