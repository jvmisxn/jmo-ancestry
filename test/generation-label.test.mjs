// Unit test for generationRowLabel — the pinned gutter label naming each
// tree generation row relative to the focus ("Grandparents", "2nd
// great-grandparents", "Grandchildren").
//
// Usage: node test/generation-label.test.mjs

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

const cases = [
  [0, "Focus generation"],
  [-1, "Parents"],
  [-2, "Grandparents"],
  [-3, "Great-grandparents"],
  [-4, "2nd great-grandparents"],
  [-5, "3rd great-grandparents"],
  [-6, "4th great-grandparents"],
  [1, "Children"],
  [2, "Grandchildren"],
  [3, "Great-grandchildren"],
  [4, "2nd great-grandchildren"],
];

let failures = 0;
for (const [generation, expected] of cases) {
  const actual = app.generationRowLabel(generation);
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL generation ${generation}: expected "${expected}", got "${actual}"`);
  }
}

if (failures) {
  console.error(`${failures} generationRowLabel case(s) failed.`);
  process.exit(1);
}
console.log(`All ${cases.length} generationRowLabel cases passed.`);
