// Persisted view state: expanded ancestor reveals and the minimal/full mode
// survive a reload, and stored ids that are not in the current dataset are
// dropped on restore.

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
check("sample data has at least two people", knownIds.length >= 2);

app.state.collapseCollateral = false;
app.state.expandedAncestors = new Set([knownIds[0], knownIds[1], "no-such-person"]);
app.saveViewState();

// Simulate a reload: state resets, then restore pulls the saved view back.
app.state.collapseCollateral = true;
app.state.expandedAncestors = new Set();
app.restoreViewState();

check("mode restored", app.state.collapseCollateral === false);
check("known reveals restored", app.state.expandedAncestors.has(knownIds[0]) && app.state.expandedAncestors.has(knownIds[1]));
check("unknown ids dropped", !app.state.expandedAncestors.has("no-such-person"));

// Corrupt storage must not throw or clobber current state.
store.set("jmo-ancestry-view-state", "{not json");
app.state.expandedAncestors = new Set([knownIds[0]]);
app.restoreViewState();
check("corrupt storage leaves state alone", app.state.expandedAncestors.has(knownIds[0]));

if (failures.length) {
  console.error(`view-state test failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log("view-state test passed.");
