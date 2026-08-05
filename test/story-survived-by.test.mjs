// Unit tests for survived-by phrasing in the generated life story death paragraph.
// Covers: 0 survivors, 1 child (named), 2 children (named), 3 children (named),
// 4+ children (count only), and surviving spouse alongside children.
//
// Usage: node test/story-survived-by.test.mjs

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

// Helper: return the death paragraph for the given dataset.
function deathParaFor(data) {
  app.state.data = data;
  const paras = app.generatedLifeStory(data.people[0]);
  return paras.find((p) => /died/i.test(p)) || null;
}

const parent = {
  id: "alice",
  name: "Alice Smith",
  birth: { date: "1900" },
  death: { date: "1970", place: "Ohio" },
  parents: [],
  spouses: [],
};

// Year-only dates render as "YEAR" (no "in"), and year-only birth+death give
// "about age N" (approx) since month precision is absent. Expected strings
// reflect the actual formatEventProse / ageAtDeath output.

// 1. No children — no survived-by clause
check(
  "no children — no survived-by",
  deathParaFor({ people: [{ ...parent, children: [] }] }),
  "Alice died in Ohio, about age 70.",
);

// 2. One surviving child — named by given name
check(
  "one surviving child — named",
  deathParaFor({
    people: [
      { ...parent, children: ["bob"] },
      { id: "bob", name: "Bob Smith", birth: { date: "1925" }, parents: ["alice"], spouses: [], children: [] },
    ],
  }),
  "Alice died in Ohio, about age 70, survived by child Bob.",
);

// 3. Two surviving children — named via list
check(
  "two surviving children — named list",
  deathParaFor({
    people: [
      { ...parent, children: ["bob", "carol"] },
      { id: "bob", name: "Bob Smith", birth: { date: "1925" }, parents: ["alice"], spouses: [], children: [] },
      { id: "carol", name: "Carol Smith", birth: { date: "1927" }, parents: ["alice"], spouses: [], children: [] },
    ],
  }),
  "Alice died in Ohio, about age 70, survived by children Bob and Carol.",
);

// 4. Three surviving children — named via Oxford list
check(
  "three surviving children — oxford list",
  deathParaFor({
    people: [
      { ...parent, children: ["bob", "carol", "dan"] },
      { id: "bob", name: "Bob Smith", birth: { date: "1925" }, parents: ["alice"], spouses: [], children: [] },
      { id: "carol", name: "Carol Smith", birth: { date: "1927" }, parents: ["alice"], spouses: [], children: [] },
      { id: "dan", name: "Dan Smith", birth: { date: "1929" }, parents: ["alice"], spouses: [], children: [] },
    ],
  }),
  "Alice died in Ohio, about age 70, survived by children Bob, Carol, and Dan.",
);

// 5. Four surviving children — count only (threshold is >3)
check(
  "four surviving children — count only",
  deathParaFor({
    people: [
      { ...parent, children: ["b", "c", "d", "e"] },
      { id: "b", name: "Bob Smith", birth: { date: "1925" }, parents: ["alice"], spouses: [], children: [] },
      { id: "c", name: "Carol Smith", birth: { date: "1927" }, parents: ["alice"], spouses: [], children: [] },
      { id: "d", name: "Dan Smith", birth: { date: "1929" }, parents: ["alice"], spouses: [], children: [] },
      { id: "e", name: "Eve Smith", birth: { date: "1931" }, parents: ["alice"], spouses: [], children: [] },
    ],
  }),
  "Alice died in Ohio, about age 70, survived by 4 children (including Bob and Carol).",
);

// 6. Two surviving children AND a surviving spouse — groups separated by ", and "
//    to avoid the ambiguous run-on "children Bob and Carol and spouse Eve".
check(
  "two children and spouse — comma separates groups",
  deathParaFor({
    people: [
      { ...parent, children: ["bob", "carol"], spouses: ["eve"] },
      { id: "bob", name: "Bob Smith", birth: { date: "1925" }, parents: ["alice"], spouses: [], children: [] },
      { id: "carol", name: "Carol Smith", birth: { date: "1927" }, parents: ["alice"], spouses: [], children: [] },
      { id: "eve", name: "Eve Jones", birth: { date: "1905" }, spouses: ["alice"], parents: [], children: [] },
    ],
  }),
  "Alice died in Ohio, about age 70, survived by children Bob and Carol, and spouse Eve.",
);

// 7. One child who predeceased — no survived-by
check(
  "predeceased child — no survived-by",
  deathParaFor({
    people: [
      { ...parent, children: ["bob"] },
      { id: "bob", name: "Bob Smith", birth: { date: "1925" }, death: { date: "1960" }, parents: ["alice"], spouses: [], children: [] },
    ],
  }),
  "Alice died in Ohio, about age 70, predeceased by child Bob.",
);

// 8. No children or spouse — survived by one parent
check(
  "survived by one parent",
  deathParaFor({
    people: [
      { id: "son", name: "Bob Smith", birth: { date: "1940" }, death: { date: "1970", place: "Ohio" }, parents: ["alice"], spouses: [], children: [] },
      { id: "alice", name: "Alice Smith", birth: { date: "1915" }, parents: [], spouses: [], children: ["son"] },
    ],
  }),
  "Bob died in Ohio, about age 30, survived by parent Alice.",
);

// 9. No children or spouse — survived by two parents (both living)
check(
  "survived by two parents",
  deathParaFor({
    people: [
      { id: "son", name: "Bob Smith", birth: { date: "1940" }, death: { date: "1970", place: "Ohio" }, parents: ["alice", "tom"], spouses: [], children: [] },
      { id: "alice", name: "Alice Smith", birth: { date: "1915" }, parents: [], spouses: ["tom"], children: ["son"] },
      { id: "tom", name: "Tom Smith", birth: { date: "1912" }, parents: [], spouses: ["alice"], children: ["son"] },
    ],
  }),
  "Bob died in Ohio, about age 30, survived by parents Alice and Tom.",
);

// 10. Survived by children AND parents
check(
  "survived by child and parent",
  deathParaFor({
    people: [
      { id: "bob", name: "Bob Smith", birth: { date: "1930" }, death: { date: "1965", place: "Ohio" }, parents: ["alice"], spouses: [], children: ["sue"] },
      { id: "alice", name: "Alice Smith", birth: { date: "1905" }, parents: [], spouses: [], children: ["bob"] },
      { id: "sue", name: "Sue Smith", birth: { date: "1955" }, parents: ["bob"], spouses: [], children: [] },
    ],
  }),
  "Bob died in Ohio, about age 35, survived by child Sue, and parent Alice.",
);

// 11. Survived by child, spouse, AND parent — three groups use Oxford comma, not ", and A, and B"
check(
  "survived by child, spouse, and parent — oxford comma",
  deathParaFor({
    people: [
      { id: "bob", name: "Bob Smith", birth: { date: "1930" }, death: { date: "1960", place: "Ohio" }, parents: ["alice"], spouses: ["eve"], children: ["sue"] },
      { id: "alice", name: "Alice Smith", birth: { date: "1905" }, parents: [], spouses: [], children: ["bob"] },
      { id: "eve", name: "Eve Jones", birth: { date: "1932" }, spouses: ["bob"], parents: [], children: ["sue"] },
      { id: "sue", name: "Sue Smith", birth: { date: "1955" }, parents: ["bob", "eve"], spouses: [], children: [] },
    ],
  }),
  "Bob died in Ohio, about age 30, survived by child Sue, spouse Eve, and parent Alice.",
);

// 12. Parent who predeceased — not shown in survived-by
check(
  "predeceased parent — not in survived-by",
  deathParaFor({
    people: [
      { id: "son", name: "Bob Smith", birth: { date: "1940" }, death: { date: "1970", place: "Ohio" }, parents: ["alice"], spouses: [], children: [] },
      { id: "alice", name: "Alice Smith", birth: { date: "1915" }, death: { date: "1965" }, parents: [], spouses: [], children: ["son"] },
    ],
  }),
  "Bob died in Ohio, about age 30.",
);

if (failures === 0) {
  console.log("All story-survived-by tests passed.");
} else {
  console.error(`${failures} test(s) failed.`);
  process.exit(1);
}
