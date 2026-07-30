// Unit test for chronologicalSources — the sources panel sorts records with a
// resolvable year (explicit date or a year read out of the label) into life
// order, and undated leads keep their original relative order after the dated
// run. Ties on the same year also stay in original order.
//
// Usage: node test/source-order.test.mjs

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
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) {
    failures += 1;
    console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok ${name}`);
  }
}

const person = { birth: { date: "1900" }, death: { date: "1969" } };
const labels = (sources, subject = person) =>
  app.chronologicalSources(sources, subject).map(({ source }) => source.label);
const years = (sources, subject = person) =>
  app.chronologicalSources(sources, subject).map(({ year }) => year);

check(
  "label years sort into life order",
  labels([
    { label: "1950 U.S. census, Allen County" },
    { label: "1920 U.S. census, Allen County" },
    { label: "1940 U.S. census, Allen County" },
  ]),
  ["1920 U.S. census, Allen County", "1940 U.S. census, Allen County", "1950 U.S. census, Allen County"],
);

check(
  "undated leads follow dated records in original order",
  labels([
    { label: "Find a Grave memorial lead" },
    { label: "1940 U.S. census" },
    { label: "FamilySearch public page lead" },
    { label: "1910 U.S. census" },
  ]),
  ["1910 U.S. census", "1940 U.S. census", "Find a Grave memorial lead", "FamilySearch public page lead"],
);

check(
  "explicit date beats label year and same-year ties keep original order",
  labels([
    { label: "Obituary, Daily News", date: "1969" },
    { label: "1969 city directory entry" },
    { label: "Death certificate", date: "1969" },
    { label: "1930 U.S. census" },
  ]),
  ["1930 U.S. census", "Obituary, Daily News", "1969 city directory entry", "Death certificate"],
);

check(
  "derived years ride along for the meta line",
  years([{ label: "1940 U.S. census" }, { label: "Photo lead" }]),
  [1940, null],
);

check(
  "person without a birth year leaves label-only sources undated",
  years([{ label: "1940 U.S. census" }, { label: "Record", date: "1912" }], {}),
  [1912, null],
);

check("empty source list stays empty", labels([]), []);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("source-order tests passed");
