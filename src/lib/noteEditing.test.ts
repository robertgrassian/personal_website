import { test } from "node:test";
import assert from "node:assert/strict";
import { continueList, toggleBullets, type Edit } from "./noteEditing.ts";

// Applies an Edit and marks the resulting selection with [ and ], or | for a caret.
function run(text: string, edit: Edit | null): string {
  if (edit === null) return "unchanged";
  const out = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  if (edit.selStart === edit.selEnd) {
    return out.slice(0, edit.selStart) + "|" + out.slice(edit.selStart);
  }
  return (
    out.slice(0, edit.selStart) +
    "[" +
    out.slice(edit.selStart, edit.selEnd) +
    "]" +
    out.slice(edit.selEnd)
  );
}

test("bullets an empty note so a list can be started", () => {
  assert.equal(run("", toggleBullets("", 0, 0)), "- |");
});

test("bullets the caret's line and keeps the caret beside the same character", () => {
  const text = "one\ntwo\nthree";
  assert.equal(run(text, toggleBullets(text, 5, 5)), "one\n- t|wo\nthree");
});

test("bullets every selected line but leaves blank lines between them alone", () => {
  const text = "one\n\ntwo";
  assert.equal(run(text, toggleBullets(text, 0, text.length)), "[- one\n\n- two]");
});

test("removes bullets when every selected line already has one", () => {
  const text = "- one\n* two\n• three";
  assert.equal(run(text, toggleBullets(text, 0, text.length)), "[one\ntwo\nthree]");
});

test("a mixed selection bullets only the lines that lack one", () => {
  const text = "- one\ntwo";
  assert.equal(run(text, toggleBullets(text, 0, text.length)), "[- one\n- two]");
});

test("a caret inside a removed marker lands at the line start", () => {
  const text = "a\n- b";
  assert.equal(run(text, toggleBullets(text, 3, 3)), "a\n|b");
});

test("a selection ending on a trailing newline does not take the next line", () => {
  const text = "one\ntwo";
  assert.equal(run(text, toggleBullets(text, 0, 4)), "[- one]\ntwo");
});

test("keeps indentation when bulleting", () => {
  const text = "  nested";
  assert.equal(run(text, toggleBullets(text, 8, 8)), "  - nested|");
});

test("Enter on a bullet starts the next one at the same indent and marker", () => {
  const text = "  * item";
  assert.equal(run(text, continueList(text, text.length)), "  * item\n  * |");
});

test("Enter in the middle of a bullet splits it into two bullets", () => {
  const text = "- abcd";
  assert.equal(run(text, continueList(text, 4)), "- ab\n- |cd");
});

test("Enter on an empty bullet ends the list", () => {
  const text = "- one\n- ";
  assert.equal(run(text, continueList(text, text.length)), "- one\n|");
});

test("Enter on plain text or inside the marker is left to the browser", () => {
  assert.equal(run("plain", continueList("plain", 5)), "unchanged");
  assert.equal(run("- x", continueList("- x", 1)), "unchanged");
});
