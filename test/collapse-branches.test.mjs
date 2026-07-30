// The Collapse branches toolbar button resets every progressive reveal
// (ancestors, siblings, children) and persists the cleared view state, so a
// reload after collapsing does not bring the expansions back.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

const { __test: app } = await import("../src/app.js");

const dataPath = fileURLToPath(new URL("../data/sample-family.json", import.meta.url));
app.state.data = JSON.parse(readFileSync(dataPath, "utf8"));

const failures = [];
const check = (label, condition) => {
  if (!condition) failures.push(label);
};

const knownIds = app.state.data.people.map((person) => person.id);
check("sample data has at least three people", knownIds.length >= 3);

app.state.collapseCollateral = true;
app.state.expandedAncestors = new Set([knownIds[0]]);
app.state.expandedSiblings = new Set([knownIds[1]]);
app.state.expandedChildren = new Set([knownIds[2]]);

app.resetExpandedAncestors();

check("ancestor reveals cleared", app.state.expandedAncestors.size === 0);
check("sibling reveals cleared", app.state.expandedSiblings.size === 0);
check("child reveals cleared", app.state.expandedChildren.size === 0);

// The cleared state must persist: a restore after reset stays empty.
app.state.expandedAncestors = new Set([knownIds[0]]);
app.state.expandedSiblings = new Set([knownIds[1]]);
app.state.expandedChildren = new Set([knownIds[2]]);
app.restoreViewState();
check("restore after reset keeps ancestors empty", app.state.expandedAncestors.size === 0);
check("restore after reset keeps siblings empty", app.state.expandedSiblings.size === 0);
check("restore after reset keeps children empty", app.state.expandedChildren.size === 0);

if (failures.length) {
  console.error(`collapse-branches test failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log("collapse-branches test passed.");
