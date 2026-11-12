import { test } from "node:test";
import assert from "node:assert/strict";
import { produceStatePath, resolveProduceState } from "./resolveState.ts";

test("a valid cookie resolves on its own", () => {
  assert.equal(resolveProduceState({ cookie: "ca", country: null, region: null }), "CA");
});

test("the cookie beats geolocation", () => {
  assert.equal(resolveProduceState({ cookie: "ca", country: "US", region: "NY" }), "CA");
});

test("US geolocation resolves when there is no cookie", () => {
  assert.equal(resolveProduceState({ cookie: undefined, country: "US", region: "NY" }), "NY");
});

test("an unknown cookie falls through to geolocation", () => {
  assert.equal(resolveProduceState({ cookie: "zz", country: "US", region: "NY" }), "NY");
});

test("an unknown region code falls through", () => {
  assert.equal(resolveProduceState({ cookie: undefined, country: "US", region: "ZZ" }), null);
});

test("a non-US visitor falls through, even with a region code that is also a state", () => {
  // Region codes are per country, so a non-US "CA" is not California.
  assert.equal(resolveProduceState({ cookie: undefined, country: "ES", region: "CA" }), null);
});

test("no signals at all falls through", () => {
  assert.equal(resolveProduceState({ cookie: undefined, country: null, region: null }), null);
});

test("a state with no season data still resolves", () => {
  assert.equal(resolveProduceState({ cookie: undefined, country: "US", region: "TX" }), "TX");
  assert.equal(resolveProduceState({ cookie: "tx", country: null, region: null }), "TX");
});

test("paths are lowercase", () => {
  assert.equal(produceStatePath("NY"), "/produce/ny");
});
