// Unit tests for birth-year span in the generated life story children paragraph.
// Covers: no span when undated, no span when all same year, span for small
// complete families, span for large families (only when all dated).
//
// Usage: node test/story-children-span.test.mjs

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

let failures = 0;
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
};

// Helper: return the family paragraph (para 3, after origin and optional marriage)
function childrenParaFor(data) {
  app.state.data = data;
  const paras = app.generatedLifeStory(data.people[0]);
  // Family para is first paragraph that mentions "children" or "Known children"
  return paras.find((p) => /children/i.test(p)) || null;
}

const parent = {
  id: "alice",
  name: "Alice Smith",
  birth: { date: "1900" },
  parents: [],
  spouses: [],
};

// 1. Single undated child — no span, no count change
check(
  "one child no date — no span",
  childrenParaFor({
    people: [
      { ...parent, children: ["c1"] },
      { id: "c1", name: "Bob Smith", parents: ["alice"], children: [], spouses: [] },
    ],
  }),
  "Known children include Bob Smith.",
);

// 2. Two children, both dated, different years — span shown
check(
  "two dated children — span shown",
  childrenParaFor({
    people: [
      { ...parent, children: ["c1", "c2"] },
      { id: "c1", name: "Bob Smith", birth: { date: "1922" }, parents: ["alice"], children: [], spouses: [] },
      { id: "c2", name: "Carol Smith", birth: { date: "1925" }, parents: ["alice"], children: [], spouses: [] },
    ],
  }),
  "Known children include Bob Smith and Carol Smith, born between 1922 and 1925.",
);

// 3. Two children — one undated — no span (partial data)
check(
  "two children, one undated — no span",
  childrenParaFor({
    people: [
      { ...parent, children: ["c1", "c2"] },
      { id: "c1", name: "Bob Smith", birth: { date: "1922" }, parents: ["alice"], children: [], spouses: [] },
      { id: "c2", name: "Carol Smith", parents: ["alice"], children: [], spouses: [] },
    ],
  }),
  "Known children include Bob Smith and Carol Smith.",
);

// 4. Two children born same year — no span (range is zero)
check(
  "two children same birth year — no span",
  childrenParaFor({
    people: [
      { ...parent, children: ["c1", "c2"] },
      { id: "c1", name: "Bob Smith", birth: { date: "1922" }, parents: ["alice"], children: [], spouses: [] },
      { id: "c2", name: "Carol Smith", birth: { date: "1922" }, parents: ["alice"], children: [], spouses: [] },
    ],
  }),
  "Known children include Bob Smith and Carol Smith.",
);

// 5. Five children all dated — large family with span
check(
  "five dated children — large family with span",
  childrenParaFor({
    people: [
      { ...parent, children: ["c1", "c2", "c3", "c4", "c5"] },
      { id: "c1", name: "Bob Smith",   birth: { date: "1920" }, parents: ["alice"], children: [], spouses: [] },
      { id: "c2", name: "Carol Smith", birth: { date: "1922" }, parents: ["alice"], children: [], spouses: [] },
      { id: "c3", name: "Dan Smith",   birth: { date: "1924" }, parents: ["alice"], children: [], spouses: [] },
      { id: "c4", name: "Eve Smith",   birth: { date: "1926" }, parents: ["alice"], children: [], spouses: [] },
      { id: "c5", name: "Fred Smith",  birth: { date: "1935" }, parents: ["alice"], children: [], spouses: [] },
    ],
  }),
  "Alice had 5 children, including Bob Smith, Carol Smith, and Dan Smith, born between 1920 and 1935.",
);

// 6. Five children listed, only four loaded — no span (incomplete data)
check(
  "five listed, four loaded — no span (incomplete)",
  childrenParaFor({
    people: [
      { ...parent, children: ["c1", "c2", "c3", "c4", "c5"] },
      { id: "c1", name: "Bob Smith",   birth: { date: "1920" }, parents: ["alice"], children: [], spouses: [] },
      { id: "c2", name: "Carol Smith", birth: { date: "1922" }, parents: ["alice"], children: [], spouses: [] },
      { id: "c3", name: "Dan Smith",   birth: { date: "1924" }, parents: ["alice"], children: [], spouses: [] },
      { id: "c4", name: "Eve Smith",   birth: { date: "1926" }, parents: ["alice"], children: [], spouses: [] },
      // c5 intentionally absent from dataset
    ],
  }),
  "Alice had 5 children, including Bob Smith, Carol Smith, and Dan Smith.",
);

if (failures === 0) {
  console.log("story-children-span: all checks passed");
} else {
  console.error(`story-children-span: ${failures} check(s) failed`);
  process.exit(1);
}
