// Unit test for branchSideAssignments — the per-ancestor branch side that
// drives the colored card stripes (which of the tree focus's two parent
// branches an ancestor hangs from). Blood ancestors match directly; ancestor
// collaterals and ancestors' spouses inherit a side; the focus generation and
// descendants carry none.
//
// Usage: node test/branch-sides.test.mjs

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
globalThis.window = { addEventListener() {}, innerWidth: 1440, location: { hash: "" } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { hash: "" };
globalThis.requestAnimationFrame = (fn) => fn;

const { __test: app } = await import("../src/app.js");

const person = (id, parents = [], spouses = []) => ({
  id, name: id, birth: null, death: null,
  parents, spouses, children: [], aliases: [], tags: [], notes: "", sources: [],
});
app.state.data = {
  people: [
    person("pgrandpa"),
    person("pgrandma", [], ["pgrandpa"]),
    person("pgrand-spouse", [], ["pgrandpa"]),
    person("dad", ["pgrandpa", "pgrandma"]),
    person("uncle", ["pgrandpa"]),
    person("mgrandpa"),
    person("mom", ["mgrandpa"]),
    person("root", ["dad", "mom"]),
    person("sibling", ["dad", "mom"]),
    person("child", ["root"]),
    person("stranger"),
  ],
};

const index = app.relationshipIndex();
const nodes = app.state.data.people.map((p) => ({ person: p }));
const sides = app.branchSideAssignments("root", nodes, index);

const cases = [
  ["dad", 0],
  ["pgrandpa", 0],
  ["pgrandma", 0],
  ["pgrand-spouse", 0], // ancestor's spouse inherits the branch through the marriage
  ["uncle", 0], // ancestor-row collateral inherits the branch through a parent
  ["mom", 1],
  ["mgrandpa", 1],
  ["root", undefined],
  ["sibling", undefined],
  ["child", undefined],
];

let failures = 0;
for (const [id, expected] of cases) {
  const actual = sides.get(id);
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL ${id}: expected ${expected}, got ${actual}`);
  }
}

// A single-parent focus has no second branch to distinguish, so no stripes.
const singleSides = app.branchSideAssignments("mom", nodes, index);
if (singleSides.size !== 0) {
  failures += 1;
  console.error(`FAIL single-parent focus: expected no sides, got ${singleSides.size}`);
}

// The markup carries the dynamic legend container, and the tips document the
// stripe so it stays discoverable.
const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
if (!html.includes('id="legend-branches"')) {
  failures += 1;
  console.error("FAIL index.html: missing #legend-branches container in the legend");
}
const treeTips = app.HELP_TIPS.find((section) => section.area === "Tree")?.tips || [];
if (!treeTips.some((tip) => /branch/i.test(tip.does))) {
  failures += 1;
  console.error("FAIL HELP_TIPS: no Tree tip documenting the branch stripe");
}

if (failures) {
  console.error(`branch-sides: ${failures} failure(s)`);
  process.exit(1);
}
console.log("branch-sides: all checks passed");
