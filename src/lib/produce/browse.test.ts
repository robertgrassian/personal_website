import { test } from "node:test";
import assert from "node:assert/strict";
import { categoriesIn, matchesQuery, regionItems, slugHash } from "./browse.ts";
import { REGIONS } from "./regions/index.ts";
import type { Produce } from "./types.ts";

test("slugHash is stable", () => {
  // Pinned: a change reshuffles every card's border on the next deploy.
  assert.equal(slugHash("strawberry"), 2218399068);
  assert.equal(slugHash(""), 0x811c9dc5);
});

test("every region's items carry a season and a variant in range", () => {
  for (const region of REGIONS) {
    const items = regionItems(region, 6);
    assert.equal(items.length, Object.keys(region.seasons).length);
    for (const item of items) {
      assert.equal(item.season, region.seasons[item.slug]);
      assert.ok(item.variant >= 0 && item.variant < 6);
    }
  }
});

test("variants are spread rather than all one border", () => {
  const items = regionItems(REGIONS[0], 6);
  assert.equal(new Set(items.map((i) => i.variant)).size, 6);
});

test("categoriesIn keeps the fixed order and drops absent ones", () => {
  const items = regionItems(REGIONS[0], 6).filter((i) => i.category !== "fruit");
  assert.deepEqual(categoriesIn(items), ["vegetable", "herb", "mushroom"]);
});

test("matchesQuery finds names, other names and singular slugs", () => {
  const cherry: Produce = {
    slug: "cherry",
    name: "Cherries",
    aka: ["Sweet cherries"],
    category: "fruit",
  };
  assert.ok(matchesQuery(cherry, "cherry"), "slug covers the singular");
  assert.ok(matchesQuery(cherry, "  CHERR "), "trimmed and case-folded");
  assert.ok(matchesQuery(cherry, "sweet"), "aka");
  assert.ok(matchesQuery(cherry, ""), "blank matches all");
  assert.ok(!matchesQuery(cherry, "plum"));
  const asianPear: Produce = { slug: "asian-pear", name: "Asian pears", category: "fruit" };
  assert.ok(matchesQuery(asianPear, "asian pear"));
  const jalapeno: Produce = { slug: "jalapeno", name: "Jalapeños", category: "vegetable" };
  assert.ok(matchesQuery(jalapeno, "jalapeno"), "accents fold");
});
