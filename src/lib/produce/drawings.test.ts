import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "./catalog.ts";
import { DRAWINGS, SHAPES } from "./drawings.ts";

const HEX = /^#[0-9a-f]{6}$/i;

test("every catalog item has a drawing, so the generic glyph is never the fallback", () => {
  const missing = CATALOG.filter((item) => !(item.slug in DRAWINGS)).map((item) => item.slug);
  assert.deepEqual(missing, []);
});

test("every drawing names a catalog slug, a known shape and real colours", () => {
  const slugs = new Set(CATALOG.map((item) => item.slug));
  for (const [slug, drawn] of Object.entries(DRAWINGS)) {
    assert.ok(slugs.has(slug), `drawing for unknown slug "${slug}"`);
    assert.ok(drawn.shape in SHAPES, `"${slug}" uses unknown shape "${drawn.shape}"`);
    assert.match(drawn.body, HEX, `"${slug}" body colour`);
    if (drawn.accent !== undefined) assert.match(drawn.accent, HEX, `"${slug}" accent colour`);
  }
});

test("every shape draws something", () => {
  for (const [id, shape] of Object.entries(SHAPES)) {
    assert.ok(shape.body.length > 0, `shape "${id}" has no body`);
    for (const path of [...shape.body, ...shape.accent, ...shape.line]) {
      assert.match(path, /^M[\d.\- ]/, `shape "${id}" has a path that does not start with M`);
    }
  }
});
