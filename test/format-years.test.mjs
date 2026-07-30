// Unit test for formatYears — the year label on tree cards, directory rows,
// relation items, and profile meta pills. Guards the death-only form so a
// record with no birth date never renders as a bare "-1954".
//
// Usage: node test/format-years.test.mjs

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
  [{ birth: { date: "1900-05-02" }, death: { date: "1980-01-01" } }, "1900–1980"],
  [{ birth: { date: "1900" } }, "b. 1900"],
  [{ death: { date: "1954-11-30" } }, "d. 1954"],
  [{ birth: null, death: null }, ""],
  [{}, ""],
];

let failures = 0;
for (const [person, expected] of cases) {
  const actual = app.formatYears(person);
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL ${JSON.stringify(person)}: expected "${expected}", got "${actual}"`);
  }
}

if (failures) {
  console.error(`${failures} formatYears case(s) failed.`);
  process.exit(1);
}
console.log(`All ${cases.length} formatYears cases passed.`);
