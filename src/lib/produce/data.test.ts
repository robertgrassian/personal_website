import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CATALOG } from "./catalog.ts";
import { REGIONS } from "./regions/index.ts";
import { STATES } from "./states.ts";
import type { Produce, Region, UsState } from "./types.ts";
import { type ProduceData, validateProduceData } from "./validate.ts";

const PUBLIC_DIR = fileURLToPath(new URL("../../../public/", import.meta.url));

test("the shipped produce data is valid", () => {
  const drafts = REGIONS.filter((r) => r.draft).map((r) => r.id);
  if (drafts.length > 0) {
    console.warn(
      `\n  NOTE: produce regions still marked draft: ${drafts.join(", ")}.` +
        "\n  Their sources, seasons and catalog coverage are not checked until the flag is removed.\n"
    );
  }
  const problems = validateProduceData({
    catalog: CATALOG,
    regions: REGIONS,
    states: STATES,
    artExists: (path) => existsSync(PUBLIC_DIR + path),
  });
  assert.deepEqual(problems, []);
});

// A small, valid dataset that each rule's test breaks in exactly one way.
function fixture(): ProduceData {
  const catalog: Produce[] = [
    { slug: "apple", name: "Apples", category: "fruit" },
    { slug: "avocado", name: "Avocados", category: "fruit", art: "produce/avocado.svg" },
  ];
  const sources = [
    { title: "One", url: "https://example.org/one" },
    { title: "Two", url: "https://example.org/two" },
  ];
  const regions: Region[] = [
    {
      id: "northeast",
      name: "the Northeast",
      timeZone: "America/New_York",
      sources: [...sources],
      seasons: { apple: "ssss...aPPPs" },
    },
    {
      id: "california",
      name: "California",
      timeZone: "America/Los_Angeles",
      sources: [...sources],
      seasons: { avocado: "aaaaPPPaaaaa" },
    },
  ];
  const states: UsState[] = STATES.map((s) => ({ ...s }));
  return { catalog, regions, states, artExists: (path) => path === "produce/avocado.svg" };
}

function problemsWith(mutate: (data: ProduceData) => void): string[] {
  const data = fixture();
  mutate(data);
  return validateProduceData(data);
}

function assertFires(mutate: (data: ProduceData) => void, expected: RegExp) {
  const problems = problemsWith(mutate);
  assert.ok(
    problems.some((p) => expected.test(p)),
    `expected a problem matching ${expected}, got ${JSON.stringify(problems)}`
  );
}

const region = (data: ProduceData, id: string) => data.regions.find((r) => r.id === id)!;
const catalog = (data: ProduceData) => data.catalog as Produce[];
const states = (data: ProduceData) => data.states as UsState[];

test("the fixture itself is valid", () => {
  assert.deepEqual(validateProduceData(fixture()), []);
});

test("a season string of the wrong length fails", () => {
  assertFires((d) => (region(d, "northeast").seasons.apple = "ssss...aPPP"), /not 12 chars/);
});

test("a season string with a letter outside .aPs fails", () => {
  assertFires((d) => (region(d, "northeast").seasons.apple = "ssss...apPPs"), /not 12 chars/);
});

test("a season string that is all out fails", () => {
  assertFires((d) => (region(d, "northeast").seasons.apple = "............"), /out all year/);
});

test("a region naming a slug not in the catalog fails", () => {
  assertFires((d) => (region(d, "northeast").seasons.pear = "........PPa."), /not in the catalog/);
});

test("a catalog item in no region fails", () => {
  assertFires(
    (d) => catalog(d).push({ slug: "pear", name: "Pears", category: "fruit" }),
    /"pear" is in no region/
  );
});

test("a slug that is not kebab-case fails", () => {
  assertFires(
    (d) => catalog(d).push({ slug: "Meyer_Lemon", name: "Meyer lemons", category: "fruit" }),
    /not kebab-case/
  );
});

test("a slug over 64 chars fails", () => {
  assertFires(
    (d) => catalog(d).push({ slug: "a".repeat(65), name: "Long", category: "fruit" }),
    /over 64 chars/
  );
});

test("a duplicated slug fails", () => {
  assertFires(
    (d) => catalog(d).push({ slug: "apple", name: "Apples again", category: "fruit" }),
    /"apple" is duplicated/
  );
});

test("a state naming a region that does not exist fails", () => {
  assertFires((d) => (states(d).find((s) => s.code === "TX")!.region = "texas"), /unknown region/);
});

test("a region with no states fails", () => {
  assertFires((d) => {
    for (const s of states(d)) if (s.region === "california") s.region = null;
  }, /"california" has no states/);
});

test("a missing state fails", () => {
  assertFires((d) => (d.states = states(d).filter((s) => s.code !== "WY")), /missing "WY"/);
});

test("an extra state fails", () => {
  assertFires(
    (d) => states(d).push({ code: "PR", name: "Puerto Rico", region: null }),
    /unexpected "PR"/
  );
});

test("a duplicated state fails", () => {
  assertFires(
    (d) => states(d).push({ code: "NY", name: "New York", region: "northeast" }),
    /"NY" is duplicated/
  );
});

test("a region with fewer than two sources fails", () => {
  assertFires((d) => region(d, "northeast").sources.pop(), /fewer than two sources/);
});

test("a source URL that is not https fails", () => {
  assertFires(
    (d) => (region(d, "northeast").sources[0].url = "http://example.org/one"),
    /is not https/
  );
});

test("a time zone Intl rejects fails", () => {
  assertFires((d) => (region(d, "northeast").timeZone = "America/Gotham"), /unknown time zone/);
});

test("an art path missing under public/ fails", () => {
  assertFires((d) => (catalog(d)[0].art = "produce/apple.svg"), /missing under public/);
});

test("a non-draft region with no seasons fails", () => {
  assertFires((d) => (region(d, "california").seasons = {}), /"california" has no seasons/);
});

test("a draft waives sources, seasons and coverage", () => {
  const problems = problemsWith((d) => {
    const ca = region(d, "california");
    ca.draft = true;
    ca.sources = [];
    ca.seasons = {};
  });
  assert.deepEqual(problems, [], "avocado is now in no region, and that is allowed");
});

test("a draft is still held to every other rule", () => {
  const problems = problemsWith((d) => {
    const ca = region(d, "california");
    ca.draft = true;
    ca.timeZone = "Nowhere/Nowhere";
    ca.sources = [{ title: "Insecure", url: "http://example.org" }];
    ca.seasons = { avocado: "aaaa", kumquat: "PPa.......aP" };
  });
  for (const expected of [
    /unknown time zone/,
    /is not https/,
    /not 12 chars/,
    /not in the catalog/,
  ]) {
    assert.ok(
      problems.some((p) => expected.test(p)),
      `${expected} in ${JSON.stringify(problems)}`
    );
  }
});
