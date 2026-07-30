// Unit test for kinshipLabel — the gender-neutral relationship description
// shown in the profile header ("Root's 1st cousin once removed").
//
// Usage: node test/kinship.test.mjs

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

// Six-generation synthetic line: gen0 (g3grand) → gen1 → gen2 → gen3 →
// root's parent (gen4) → root (gen5). Side branches give aunt/cousin cases.
const person = (id, parents = [], spouses = []) => ({
  id, name: id, birth: null, death: null,
  parents, spouses, children: [], aliases: [], tags: [], notes: "", sources: [],
});
app.state.data = {
  people: [
    person("g3grand"),
    person("g2grand", ["g3grand"]),
    person("ggrand", ["g2grand"]),
    person("ggrand-sibling", ["g2grand"]),
    person("grand", ["ggrand"]),
    person("grand-sibling", ["ggrand"]),
    person("grand-spouse", [], ["grand"]),
    person("parent", ["grand"]),
    person("aunt", ["grand"]),
    person("cousin", ["aunt"]),
    person("cousin-child", ["cousin"]),
    person("root", ["parent", "parent2"]),
    person("parent2", []),
    person("spouse", [], ["root"]),
    person("spouse-sibling-parent"),
    person("spouse-sibling", ["spouse-sibling-parent"]),
    person("sibling", ["parent"]),
    person("full-sibling", ["parent", "parent2"]),
    person("half-sibling", ["parent", "half-parent"]),
    person("half-parent"),
    person("niece", ["sibling"]),
    person("child", ["root"]),
    person("grandchild", ["child"]),
    person("child-in-law", [], ["child"]),
    person("stranger"),
  ],
};
// Link spouse-side: spouse and spouse-sibling share a parent.
app.state.data.people.find((p) => p.id === "spouse").parents = ["spouse-sibling-parent"];

const index = app.relationshipIndex();
const cases = [
  ["root", ""],
  ["parent", "parent"],
  ["grand", "grandparent"],
  ["ggrand", "great-grandparent"],
  ["g2grand", "2nd great-grandparent"],
  ["g3grand", "3rd great-grandparent"],
  ["sibling", "sibling"],
  ["full-sibling", "sibling"],
  ["half-sibling", "half-sibling"],
  ["child", "child"],
  ["grandchild", "grandchild"],
  ["aunt", "aunt or uncle"],
  ["grand-sibling", "great-aunt or great-uncle"],
  ["ggrand-sibling", "2nd great-aunt or great-uncle"],
  ["niece", "niece or nephew"],
  ["cousin", "1st cousin"],
  ["cousin-child", "1st cousin once removed"],
  ["spouse", "spouse"],
  ["grand-spouse", "grandparent's spouse"],
  ["child-in-law", "child's spouse"],
  ["spouse-sibling", "spouse's sibling"],
  ["stranger", ""],
];

let failures = 0;
for (const [id, expected] of cases) {
  const actual = app.kinshipLabel(id, "root", index);
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL ${id}: expected "${expected}", got "${actual}"`);
  }
}

// Symmetry spot-checks from the other direction.
const reverseCases = [
  ["root", "g3grand", "3rd great-grandchild"],
  ["root", "aunt", "niece or nephew"],
  ["root", "cousin-child", "1st cousin once removed"],
];
for (const [a, b, expected] of reverseCases) {
  const actual = app.kinshipLabel(a, b, index);
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL ${a} rel to ${b}: expected "${expected}", got "${actual}"`);
  }
}

if (failures) {
  console.error(`${failures} kinship case(s) failed.`);
  process.exit(1);
}
console.log(`All ${cases.length + reverseCases.length} kinship cases passed.`);
