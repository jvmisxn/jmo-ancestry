// Unit test for relationPath — the clickable person chain shown under the
// kinship label (focus → shared ancestor → selected person).
//
// Usage: node test/relation-path.test.mjs

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
    person("g2grand"),
    person("ggrand", ["g2grand"]),
    person("grand", ["ggrand"]),
    person("grand-spouse", [], ["grand"]),
    person("aunt", ["grand"]),
    person("cousin", ["aunt"]),
    person("parent", ["grand"]),
    person("root", ["parent"]),
    person("spouse", ["spouse-parent"], ["root"]),
    person("spouse-parent"),
    person("child", ["root"]),
    person("grandchild", ["child"]),
    person("stranger"),
  ],
};

const index = app.relationshipIndex();
const cases = [
  // [target, expected path from root]
  ["root", []],
  ["stranger", []],
  ["parent", ["root", "parent"]],
  ["grand", ["root", "parent", "grand"]],
  ["g2grand", ["root", "parent", "grand", "ggrand", "g2grand"]],
  ["grandchild", ["root", "child", "grandchild"]],
  // Cousin path climbs to the shared grandparent, then back down.
  ["cousin", ["root", "parent", "grand", "aunt", "cousin"]],
  // Affinal hops: blood relative's spouse, and spouse's blood relative.
  ["grand-spouse", ["root", "parent", "grand", "grand-spouse"]],
  ["spouse-parent", ["root", "spouse", "spouse-parent"]],
  ["spouse", ["root", "spouse"]],
];

let failures = 0;
for (const [id, expected] of cases) {
  const actual = app.relationPath(id, "root", index);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(`FAIL ${id}: expected [${expected}], got [${actual}]`);
  }
}

if (failures) {
  console.error(`${failures} relation-path case(s) failed`);
  process.exit(1);
}
console.log(`All ${cases.length} relation-path cases passed.`);
