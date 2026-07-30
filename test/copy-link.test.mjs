// Profile deep links: the Copy-link button shares the same #p= hash the
// router restores, so the link must encode ids safely and match the pattern
// personIdFromHash parses on load.

import { strict as assert } from "node:assert";

globalThis.__JMO_HEADLESS_TEST__ = true;

const stubEl = () => ({
  addEventListener() {},
  setAttribute() {},
  removeAttribute() {},
  replaceChildren() {},
  append() {},
  classList: { toggle() {}, add() {}, remove() {} },
  style: {},
  textContent: "",
  value: "",
  hidden: false,
});
globalThis.document = {
  querySelector: () => stubEl(),
  createElement: () => stubEl(),
  createElementNS: () => stubEl(),
  body: { classList: { toggle() {} } },
};
globalThis.window = {
  addEventListener() {},
  innerWidth: 1440,
  location: { hash: "" },
};
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
globalThis.location = { hash: "" };
globalThis.requestAnimationFrame = (fn) => fn;

const { __test } = await import("../src/app.js");
const { personLink } = __test;

assert.equal(
  personLink("smith-john-1900", "https://example.com/jmo-ancestry/"),
  "https://example.com/jmo-ancestry/#p=smith-john-1900",
);

// Ids with spaces or reserved characters must survive the URL round trip.
const link = personLink("o'brien mary #2", "https://example.com/tree");
assert.equal(link, "https://example.com/tree#p=o'brien%20mary%20%232");
const match = link.slice(link.indexOf("#")).match(/^#p=(.+)$/);
assert.ok(match, "link hash matches the pattern the router parses");
assert.equal(decodeURIComponent(match[1]), "o'brien mary #2");

console.log("copy-link tests passed.");
