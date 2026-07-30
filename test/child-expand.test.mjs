// Unit test for progressive descendant expansion in minimal-tree mode:
// hiddenChildIds (drives the "Show children" pill), the expandedChildren
// visibility rule in expandedTreeIds, child reveal through
// revealAncestorPath, and view-state persistence of the reveal set.
//
// Usage: node test/child-expand.test.mjs

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
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
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
    person("aunt-husband", [], ["aunt"]),
    person("cousin", ["aunt", "aunt-husband"]),
    person("cousin-kid", ["cousin"]),
    person("root", ["dad", "mom"]),
    person("son", ["root"]),
    person("grandchild", ["son"]),
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
app.state.expandedChildren = new Set();

// Baseline minimal tree: root's children show, grandchildren stay hidden and
// the son's card reports one hidden child for the pill.
let visible = app.expandedTreeIds("root", index);
check("son visible in baseline", visible.has("son"));
check("grandchild hidden in baseline", !visible.has("grandchild"));
check("son shows one hidden child", app.hiddenChildIds("son", visible, index).size === 1);
check("root has no hidden children", app.hiddenChildIds("root", visible, index).size === 0);

// Expanding the son's children brings the grandchild onto the tree.
app.state.expandedChildren = new Set(["son"]);
visible = app.expandedTreeIds("root", index);
check("grandchild revealed", visible.has("grandchild"));
check("son pill drained after reveal", app.hiddenChildIds("son", visible, index).size === 0);

// Cousins: reveal the aunt via grandparents + sibling expand, then her
// children (and their spouses) via the child expand.
app.state.expandedAncestors = new Set(["root", "dad"]);
app.state.expandedSiblings = new Set(["dad"]);
app.state.expandedChildren = new Set();
visible = app.expandedTreeIds("root", index);
check("aunt revealed as sibling", visible.has("aunt"));
check("cousin hidden before child expand", !visible.has("cousin"));
check("aunt shows one hidden child", app.hiddenChildIds("aunt", visible, index).size === 1);
app.state.expandedChildren = new Set(["aunt"]);
visible = app.expandedTreeIds("root", index);
check("cousin revealed", visible.has("cousin"));
check("cousin's other parent joins as spouse", visible.has("aunt-husband"));
check("cousin's own child stays hidden", !visible.has("cousin-kid"));

// Chained reveals cascade: expanding the cousin's children too goes one
// generation deeper through the fixpoint loop.
app.state.expandedChildren = new Set(["aunt", "cousin"]);
visible = app.expandedTreeIds("root", index);
check("chained reveal reaches cousin's child", visible.has("cousin-kid"));

// A child reveal keyed on a hidden person stays inert.
app.state.expandedAncestors = new Set();
app.state.expandedSiblings = new Set();
app.state.expandedChildren = new Set(["aunt"]);
visible = app.expandedTreeIds("root", index);
check("reveal inert while parent hidden", !visible.has("cousin"));

// revealAncestorPath: selecting the hidden grandchild keys a child reveal on
// the visible son (no visible sibling anchor exists for an only child).
app.state.expandedAncestors = new Set();
app.state.expandedSiblings = new Set();
app.state.expandedChildren = new Set();
check("reveal path finds grandchild", app.revealAncestorPath("grandchild") === true);
check("reveal keyed on visible parent", app.state.expandedChildren.has("son"));
visible = app.expandedTreeIds("root", index);
check("grandchild visible after reveal path", visible.has("grandchild"));

// View state round-trips the child reveal set.
app.state.expandedChildren = new Set(["son"]);
app.saveViewState();
app.state.expandedChildren = new Set();
app.restoreViewState();
check("child reveals persist across reloads", app.state.expandedChildren.has("son"));

if (failures.length) {
  console.error(`child-expand: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
console.log("child-expand: all checks passed");
