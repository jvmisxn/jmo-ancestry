// Re-importing an updated family.json must keep the user's place (selection,
// tree focus, branch reveals) when those people survive, and the import
// status line must say how many people are new — but only when the file
// updates the dataset already loaded, not when it replaces it wholesale.

import { strict as assert } from "node:assert";

globalThis.__JMO_HEADLESS_TEST__ = true;

const stubEl = () => ({
  addEventListener() {},
  setAttribute() {},
  removeAttribute() {},
  replaceChildren() {},
  append() {},
  appendChild() {},
  prepend() {},
  remove() {},
  focus() {},
  closest: () => null,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1024, height: 640 }),
  clientWidth: 1024,
  clientHeight: 640,
  classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
  style: {},
  dataset: {},
  textContent: "",
  value: "",
  hidden: false,
});
globalThis.document = {
  querySelector: () => stubEl(),
  querySelectorAll: () => [],
  createElement: () => stubEl(),
  createElementNS: () => stubEl(),
  createDocumentFragment: () => stubEl(),
  createTextNode: () => stubEl(),
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
globalThis.history = { replaceState() {}, pushState() {} };

const { __test: app } = await import("../src/app.js");

const person = (id, extra = {}) => ({ id, name: `Person ${id}`, ...extra });
const oldData = {
  meta: { defaultPersonId: "root" },
  people: [person("root"), person("dad"), person("gran"), person("uncle")],
};
const newData = {
  meta: { defaultPersonId: "root" },
  people: [person("root"), person("dad"), person("gran"), person("newborn")],
};

const prior = {
  selectedId: "gran",
  rootId: "dad",
  collapseCollateral: false,
  expandedAncestors: new Set(["dad", "uncle"]),
  expandedSiblings: new Set(["uncle"]),
  expandedChildren: new Set(["gran"]),
};

// Place survives when the selected person exists in the new data.
const place = app.preservedPlace(prior, newData);
assert.equal(place.selectedId, "gran", "selection kept");
assert.equal(place.rootId, "dad", "tree focus kept");
assert.equal(place.collapseCollateral, false, "view mode kept");
assert.deepEqual(place.expandedAncestors, ["dad"], "vanished reveal ids dropped");
assert.deepEqual(place.expandedSiblings, [], "vanished sibling reveals dropped");
assert.deepEqual(place.expandedChildren, ["gran"], "surviving child reveals kept");

// Tree focus falls back to the selection when only the focus vanished.
const focusGone = app.preservedPlace({ ...prior, rootId: "uncle" }, newData);
assert.equal(focusGone.rootId, "gran", "root falls back to selection");

// No place to keep when the selected person is gone or nothing was loaded.
assert.equal(app.preservedPlace({ ...prior, selectedId: "uncle" }, newData), null);
assert.equal(app.preservedPlace(null, newData), null);

// adoptData applies a preserved place instead of resetting to the default.
app.state.data = oldData;
app.adoptData(newData, place);
assert.equal(app.state.selectedId, "gran", "adopt keeps selection");
assert.equal(app.state.rootId, "dad", "adopt keeps focus");
assert.equal(app.state.collapseCollateral, false, "adopt keeps view mode");
assert.ok(app.state.expandedAncestors.has("dad"), "adopt keeps reveals");
assert.ok(!app.state.expandedAncestors.has("uncle"), "adopt drops vanished reveals");

// Without a place, adoptData resets to the default person as before.
app.adoptData(newData);
assert.equal(app.state.selectedId, "root", "no place resets to default");
assert.equal(app.state.collapseCollateral, true, "no place resets view mode");
assert.equal(app.state.expandedAncestors.size, 0, "no place clears reveals");

// Summary names newcomers on a same-dataset update…
const priorIds = new Set(oldData.people.map((p) => p.id));
assert.equal(
  app.importedPeopleSummary(newData, priorIds),
  "4 people (1 new: Person newborn)",
);
// …caps the name list at three…
const grown = {
  people: [...oldData.people, person("a"), person("b"), person("c"), person("d")],
};
assert.equal(
  app.importedPeopleSummary(grown, priorIds),
  "8 people (4 new: Person a, Person b, Person c, +1 more)",
);
// …says so when nothing changed…
assert.equal(app.importedPeopleSummary(oldData, priorIds), "4 people (no new people)");
// …and stays plain for a first import or an unrelated dataset (no id overlap).
assert.equal(app.importedPeopleSummary(newData, null), "4 people");
const unrelated = { people: [person("x"), person("y")] };
assert.equal(app.importedPeopleSummary(unrelated, priorIds), "2 people");

console.log("import-place test passed.");
