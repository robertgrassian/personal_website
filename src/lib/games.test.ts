import { test } from "node:test";
import assert from "node:assert/strict";
import { previewReleaseDate, type CatalogPreview } from "./games.ts";

const preview: CatalogPreview = {
  genres: [],
  releaseDate: "2025-10-27",
  platformReleaseDates: { "PC (Microsoft Windows)": "2025-10-27", "Nintendo Switch 2": null },
};

test("the typed system's own date wins", () => {
  const dated = { ...preview, platformReleaseDates: { "Nintendo Switch 2": "2026-10-27" } };
  assert.equal(previewReleaseDate(dated, "Nintendo Switch 2"), "2026-10-27");
});

test("an undated port shows no date, not the original's", () => {
  assert.equal(previewReleaseDate(preview, "Nintendo Switch 2"), null);
});

test("an unknown or empty system falls back to the game-level date", () => {
  assert.equal(previewReleaseDate(preview, "Custom Arcade"), "2025-10-27");
  assert.equal(previewReleaseDate(preview, ""), "2025-10-27");
});

test("a system named like an Object.prototype key is not a match", () => {
  assert.equal(previewReleaseDate(preview, "toString"), "2025-10-27");
});
