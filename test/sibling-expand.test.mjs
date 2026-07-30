// Unit test for progressive sibling expansion in minimal-tree mode:
// hiddenSiblingIds (drives the "Show siblings" pill), the expandedSiblings
// visibility rule in expandedTreeIds, and sibling reveal through
// revealAncestorPath for search/story-link selections.
//
// Usage: node test/sibling-expand.test.mjs

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
    person("grandpa"),
    person("grandma", [], ["grandpa"]),
    person("dad", ["grandpa", "grandma"]),
    person("mom", [], ["dad"]),
    person("aunt", ["grandpa", "grandma"]),
    person("uncle", ["grandpa", "grandma"]),
    person("root", ["dad", "mom"]),
    person("sister", ["dad", "mom"]),
    person("half-brother", ["dad"]),
    person("only-child", []),
  ],
};

const index = app.relationshipIndex();
const failures = [];
const check = (label, condition) => {
  if (!condition) failures.push(label);
};

app.state.rootId = "root";
app.state.collapseCollateral = true;
app.state.expandedAncestors = new Set();
app.state.expandedSiblings = new Set();

// Baseline minimal tree: root + parents-not-yet... actually root, spouses,
// children only. Parents are hidden until expanded, so no sibling pill yet.
let visible = app.expandedTreeIds("root", index);
check("baseline hides siblings", !visible.has("sister"));
check("no sibling pill while parents hidden", app.hiddenSiblingIds("root", visible, index).size === 0);

// Expanding root's parents makes the sibling pill appear with both siblings.
app.state.expandedAncestors = new Set(["root"]);
visible = app.expandedTreeIds("root", index);
check("parents visible after expansion", visible.has("dad") && visible.has("mom"));
const hidden = app.hiddenSiblingIds("root", visible, index);
check("pill counts full and half siblings", hidden.size === 2 && hidden.has("sister") && hidden.has("half-brother"));

// Turning on the sibling reveal brings both onto the tree.
app.state.expandedSiblings = new Set(["root"]);
visible = app.expandedTreeIds("root", index);
check("sister revealed", visible.has("sister"));
check("half-brother revealed", visible.has("half-brother"));
check("pill drained after reveal", app.hiddenSiblingIds("root", visible, index).size === 0);

// Aunts/uncles: expand up to grandparents, then reveal dad's siblings.
app.state.expandedAncestors = new Set(["root", "dad"]);
app.state.expandedSiblings = new Set();
visible = app.expandedTreeIds("root", index);
check("aunt hidden before reveal", !visible.has("aunt"));
check("dad shows two hidden siblings", app.hiddenSiblingIds("dad", visible, index).size === 2);
app.state.expandedSiblings = new Set(["dad"]);
visible = app.expandedTreeIds("root", index);
check("aunt and uncle revealed", visible.has("aunt") && visible.has("uncle"));

// A sibling reveal keyed on a person whose parents are hidden stays inert.
app.state.expandedAncestors = new Set();
app.state.expandedSiblings = new Set(["root"]);
visible = app.expandedTreeIds("root", index);
check("reveal inert while parents hidden", !visible.has("sister"));

// revealAncestorPath: selecting a hidden sibling of a visible person keys the
// reveal on the visible sibling.
app.state.expandedAncestors = new Set(["root"]);
app.state.expandedSiblings = new Set();
check("reveal path finds sister", app.revealAncestorPath("sister") === true);
check("reveal keyed on visible sibling", app.state.expandedSiblings.size === 1);
visible = app.expandedTreeIds("root", index);
check("sister visible after reveal path", visible.has("sister"));

// revealAncestorPath: a hidden aunt expands the ancestor chain to the shared
// grandparents, then reveals her as dad's sibling.
app.state.expandedAncestors = new Set();
app.state.expandedSiblings = new Set();
check("reveal path finds aunt", app.revealAncestorPath("aunt") === true);
visible = app.expandedTreeIds("root", index);
check("aunt visible after reveal path", visible.has("aunt"));
check("grandparents pulled in for aunt", visible.has("grandpa") && visible.has("grandma"));

// No siblings at all: nothing to show or hide.
check("only child has no hidden siblings", app.hiddenSiblingIds("only-child", new Set(["only-child"]), index).size === 0);

if (failures.length) {
  console.error(`sibling-expand: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
console.log("sibling-expand: all checks passed");
