// Unit test for humanizeDate/formatEvent — the Born/Died facts and generated
// life-story sentences. Guards that ISO dates read as prose ("March 4, 1899")
// while hand-written research dates ("abt 1850") pass through untouched.
//
// Usage: node test/format-event.test.mjs

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

const dateCases = [
  ["1899-03-04", "March 4, 1899"],
  ["1899-03", "March 1899"],
  ["1899", "1899"],
  ["abt 1850", "abt 1850"],
  ["before 1900", "before 1900"],
  ["1899-13", "1899-13"],
  ["", ""],
  [undefined, ""],
];

const eventCases = [
  [{ date: "1899-03-04", place: "Cleveland, Ohio" }, "March 4, 1899 · Cleveland, Ohio"],
  [{ date: "1899-03-04" }, "March 4, 1899"],
  [{ place: "Cleveland, Ohio" }, "Cleveland, Ohio"],
  [{}, ""],
  [null, ""],
];

let failures = 0;
for (const [value, expected] of dateCases) {
  const actual = app.humanizeDate(value);
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL humanizeDate(${JSON.stringify(value)}): expected "${expected}", got "${actual}"`);
  }
}
for (const [event, expected] of eventCases) {
  const actual = app.formatEvent(event);
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL formatEvent(${JSON.stringify(event)}): expected "${expected}", got "${actual}"`);
  }
}

if (failures) {
  console.error(`${failures} date-format case(s) failed.`);
  process.exit(1);
}
console.log(`All ${dateCases.length + eventCases.length} date-format cases passed.`);
