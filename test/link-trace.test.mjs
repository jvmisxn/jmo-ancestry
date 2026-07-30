// Unit test for lineage hover tracing — hovering a card should light the
// connectors carrying each hop of the relation path back to the tree focus,
// while sibling drops and uninvolved spouse links stay dark.
//
// Usage: node test/link-trace.test.mjs

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
    person("grand"),
    person("grand-spouse", [], ["grand"]),
    person("parent", ["grand", "grand-spouse"]),
    person("aunt", ["grand", "grand-spouse"]),
    person("cousin", ["aunt"]),
    person("root", ["parent"]),
    person("spouse", [], ["root"]),
    person("stranger"),
  ],
};

const index = app.relationshipIndex();
let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label} (got ${actual}, want ${expected})`);
};

// Path root → parent → grand → aunt → cousin has four hops.
const hops = app.lineageHops("cousin", "root", index);
check("cousin path has 4 hops", hops.size, 4);

// The parent-child drop for the hop rides links listing both parents + child.
check("drop carrying parent hop lights", app.linkOnLineage(["grand", "grand-spouse", "parent"], hops), true);
check("aunt's drop lights", app.linkOnLineage(["grand", "grand-spouse", "aunt"], hops), true);
check("cousin's drop lights", app.linkOnLineage(["aunt", "cousin"], hops), true);

// Uninvolved edges stay dark: the grandparents' spouse link (no hop pairs
// both spouses) and an unrelated drop.
check("grandparents' spouse link stays dark", app.linkOnLineage(["grand", "grand-spouse"], hops), false);
check("unrelated drop stays dark", app.linkOnLineage(["stranger", "spouse"], hops), false);

// Focus itself and strangers have no path, so nothing extra lights.
check("focus has no hops", app.lineageHops("root", "root", index).size, 0);
check("stranger has no hops", app.lineageHops("stranger", "root", index).size, 0);
check("empty hops light nothing", app.linkOnLineage(["grand", "parent"], new Set()), false);

// Affinal hop: the spouse of the focus traces across the marriage link.
const spouseHops = app.lineageHops("spouse", "root", index);
check("spouse link carries the affinal hop", app.linkOnLineage(["root", "spouse"], spouseHops), true);

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("link-trace tests passed");
