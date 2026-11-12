import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath, signInPath } from "./nextPath.ts";

const FALLBACK = "/library";

test("a local path passes through untouched", () => {
  assert.equal(safeNextPath("/about", FALLBACK), "/about");
  assert.equal(safeNextPath("/", FALLBACK), "/");
  assert.equal(
    safeNextPath("/video-games/u/rob?view=wishlist#top", FALLBACK),
    "/video-games/u/rob?view=wishlist#top"
  );
});

test("anything that could leave the site falls back", () => {
  for (const raw of [
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "https://evil.com",
    "@evil.com",
    "evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/about\r\n",
    "/about\u0000",
    "/about\u007f",
  ]) {
    assert.equal(safeNextPath(raw, FALLBACK), FALLBACK, JSON.stringify(raw));
  }
});

test("signInPath encodes next and puts the error first", () => {
  assert.equal(signInPath("/about"), "/sign-in?next=%2Fabout");
  assert.equal(
    signInPath("/a?b=1&c=2", "oauth_failed"),
    "/sign-in?error=oauth_failed&next=%2Fa%3Fb%3D1%26c%3D2"
  );
});

test("missing or empty falls back", () => {
  assert.equal(safeNextPath(null, FALLBACK), FALLBACK);
  assert.equal(safeNextPath(undefined, FALLBACK), FALLBACK);
  assert.equal(safeNextPath("", FALLBACK), FALLBACK);
});

test("the auth hops are not a destination", () => {
  for (const raw of [
    "/auth/callback",
    "/auth/confirm?next=/about",
    "/sign-in",
    "/sign-in?next=/x",
  ]) {
    assert.equal(safeNextPath(raw, FALLBACK), FALLBACK, raw);
  }
  // A path that merely starts with the same letters is fine.
  assert.equal(safeNextPath("/sign-in-help", FALLBACK), "/sign-in-help");
  assert.equal(safeNextPath("/authors", FALLBACK), "/authors");
});
