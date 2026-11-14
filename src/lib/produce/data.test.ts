import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ART_SOURCES, artFor } from "./art/index.ts";
import { CATALOG } from "./catalog.ts";
import { REGIONS } from "./regions/index.ts";
import { STATES } from "./states.ts";
import type { ArtImage, ArtSource, Produce, Region, UsState } from "./types.ts";
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
    artSources: ART_SOURCES,
    artExists: (path) => existsSync(PUBLIC_DIR + path),
  });
  assert.deepEqual(problems, []);
});

// A small, valid dataset that each rule's test breaks in exactly one way.
function fixture(): ProduceData {
  const catalog: Produce[] = [
    { slug: "apple", name: "Apples", category: "fruit" },
    { slug: "avocado", name: "Avocados", category: "fruit" },
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
  const artSources: ArtSource[] = [
    {
      id: "test-source",
      credit: { name: "A source", url: "https://example.org/source" },
      license: "Public domain",
      kind: "plate",
      images: {
        avocado: { file: "produce/avocado.svg", sourceUrl: "https://example.org/avocado" },
      },
    },
  ];
  return {
    catalog,
    regions,
    states,
    artSources,
    artExists: (path) => path === "produce/avocado.svg",
  };
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
const artSources = (data: ProduceData) => data.artSources as ArtSource[];
const artImages = (data: ProduceData) => data.artSources[0].images as Record<string, ArtImage>;
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

test("an art file missing under public/ fails", () => {
  assertFires((d) => (artImages(d).avocado.file = "produce/gone.svg"), /missing under public/);
});

test("art for a slug the catalog does not have fails", () => {
  assertFires((d) => (artImages(d).mango = { ...artImages(d).avocado }), /unknown slug "mango"/);
});

test("an art source with no license fails", () => {
  assertFires((d) => (artSources(d)[0] = { ...d.artSources[0], license: " " }), /has no license/);
});

test("an art image without an https source url fails", () => {
  assertFires(
    (d) => (artImages(d).avocado.sourceUrl = "http://example.org/avocado"),
    /no https sourceUrl/
  );
});

test("an art source credit that is not https fails", () => {
  assertFires(
    (d) => (artSources(d)[0] = { ...d.artSources[0], credit: { name: "A", url: "http://x.org" } }),
    /credit url .* is not https/
  );
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

test("artFor takes the first source that has the item, and nothing when none does", () => {
  const source = (id: string, kind: ArtSource["kind"], slugs: string[]): ArtSource => ({
    id,
    credit: { name: id, url: "https://example.org" },
    license: "Public domain",
    kind,
    images: Object.fromEntries(
      slugs.map((slug) => [
        slug,
        { file: `produce/art/${id}/${slug}.jpg`, sourceUrl: "https://example.org" },
      ])
    ),
  });
  const first = source("first", "plate", ["apple"]);
  const second = source("second", "engraving", ["apple", "pear"]);
  assert.deepEqual(artFor("apple", [first, second]), {
    src: "/produce/art/first/apple.jpg",
    kind: "plate",
  });
  assert.deepEqual(artFor("pear", [first, second]), {
    src: "/produce/art/second/pear.jpg",
    kind: "engraving",
  });
  assert.equal(artFor("kale", [first, second]), undefined);
  // Reordering is how one item's picture is switched.
  assert.equal(artFor("apple", [second, first])?.kind, "engraving");
});

test("the shipped sources resolve to public paths, a plate before an engraving", () => {
  assert.deepEqual(artFor("apple"), {
    src: "/produce/art/usda-pomological/apple.jpg",
    kind: "plate",
  });
  assert.equal(artFor("carrot")?.kind, "engraving");
});
