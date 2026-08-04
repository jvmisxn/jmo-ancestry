// Unit tests for sibling context in the generated life story origin paragraph.
// Covers: no siblings, 1 sibling (2 total), 3 total, 5 total (name list omitted).
//
// Usage: node test/story-siblings.test.mjs

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

function originFor(data) {
  app.state.data = data;
  return app.generatedLifeStory(data.people[0])[0];
}

const mom = { id: "mom", name: "Mary Adams", parents: [], children: [], spouses: [] };
const dad = { id: "dad", name: "John Adams", parents: [], children: [], spouses: [] };

// 1. No siblings — sentence unchanged
check(
  "no siblings",
  originFor({
    people: [
      { id: "alice", name: "Alice Adams", birth: { date: "1900" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { ...dad, children: ["alice"] },
      { ...mom, children: ["alice"] },
    ],
  }),
  "Alice Adams (b. 1900) is recorded in the family tree. Alice was the child of John Adams and Mary Adams.",
);

// 2. One sibling (2 total) — "alongside <name>"
check(
  "one sibling",
  originFor({
    people: [
      { id: "alice", name: "Alice Adams", birth: { date: "1900" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { id: "bob", name: "Bob Adams", birth: { date: "1902" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { ...dad, children: ["alice", "bob"] },
      { ...mom, children: ["alice", "bob"] },
    ],
  }),
  "Alice Adams (b. 1900) is recorded in the family tree. Alice was the child of John Adams and Mary Adams, one of 2 children alongside Bob Adams.",
);

// 3. Three total children — lists all siblings
check(
  "two siblings (3 total)",
  originFor({
    people: [
      { id: "alice", name: "Alice Adams", birth: { date: "1900" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { id: "bob", name: "Bob Adams", birth: { date: "1902" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { id: "carol", name: "Carol Adams", birth: { date: "1904" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { ...dad, children: ["alice", "bob", "carol"] },
      { ...mom, children: ["alice", "bob", "carol"] },
    ],
  }),
  "Alice Adams (b. 1900) is recorded in the family tree. Alice was the child of John Adams and Mary Adams, one of 3 children alongside Bob Adams and Carol Adams.",
);

// 4. Four total children — still lists siblings (max for inline list)
check(
  "three siblings (4 total)",
  originFor({
    people: [
      { id: "alice", name: "Alice Adams", birth: { date: "1900" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { id: "bob", name: "Bob Adams", birth: { date: "1902" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { id: "carol", name: "Carol Adams", birth: { date: "1904" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { id: "dan", name: "Dan Adams", birth: { date: "1906" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { ...dad, children: ["alice", "bob", "carol", "dan"] },
      { ...mom, children: ["alice", "bob", "carol", "dan"] },
    ],
  }),
  "Alice Adams (b. 1900) is recorded in the family tree. Alice was the child of John Adams and Mary Adams, one of 4 children alongside Bob Adams, Carol Adams, and Dan Adams.",
);

// 5. Five total — count only, no name list
check(
  "four siblings (5 total) — count only",
  originFor({
    people: [
      { id: "alice", name: "Alice Adams", birth: { date: "1900" }, parents: ["dad", "mom"], children: [], spouses: [] },
      { id: "bob", name: "Bob Adams", parents: ["dad", "mom"], children: [], spouses: [] },
      { id: "carol", name: "Carol Adams", parents: ["dad", "mom"], children: [], spouses: [] },
      { id: "dan", name: "Dan Adams", parents: ["dad", "mom"], children: [], spouses: [] },
      { id: "eve", name: "Eve Adams", parents: ["dad", "mom"], children: [], spouses: [] },
      { ...dad, children: ["alice", "bob", "carol", "dan", "eve"] },
      { ...mom, children: ["alice", "bob", "carol", "dan", "eve"] },
    ],
  }),
  "Alice Adams (b. 1900) is recorded in the family tree. Alice was the child of John Adams and Mary Adams, one of 5 children alongside Bob, Carol, and 2 others.",
);

if (failures === 0) {
  console.log("story-siblings: all checks passed");
} else {
  console.error(`story-siblings: ${failures} check(s) failed`);
  process.exit(1);
}
