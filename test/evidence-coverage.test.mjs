// Unit test for evidenceCoverage — the profile panel checklist that turns
// facts, relationship links, sources, and confidence tags into research gaps.
//
// Usage: node test/evidence-coverage.test.mjs

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
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

const person = (id, extra = {}) => ({
  id,
  name: `Person ${id}`,
  parents: [],
  spouses: [],
  children: [],
  aliases: [],
  tags: [],
  notes: "",
  sources: [],
  ...extra,
});

app.state.data = {
  people: [
    person("root", {
      birth: { date: "1900", place: "Kentucky" },
      death: { date: "1970", place: "Kentucky" },
      parents: ["father", "mother"],
      spouses: ["spouse"],
      children: ["child"],
      sources: [
        { label: "Kentucky birth certificate, 1900", type: "record" },
        { label: "Death certificate, 1970", type: "record" },
        { label: "1930 U.S. census household with parents and child", type: "record" },
        { label: "Marriage license, Allen County, 1921", type: "record" },
        { label: "Find a Grave memorial", repository: "Find a Grave" },
      ],
    }),
    person("father", { children: ["root"] }),
    person("mother", { children: ["root"] }),
    person("spouse", { spouses: ["root"], children: ["child"] }),
    person("child", { parents: ["root", "spouse"] }),
    person("thin", {
      birth: { date: "1900" },
      parents: ["father"],
      tags: ["needs direct source"],
      sources: [{ label: "Ancestry family tree lead", type: "lead" }],
    }),
    person("conflict", {
      birth: { date: "1900" },
      tags: ["date conflict"],
    }),
  ],
};
app.state.cachedPeople = null;

const covered = app.evidenceCoverage(app.state.data.people[0]);
check("fully covered statuses", covered.map((item) => [item.key, item.status]), [
  ["birth", "sourced"],
  ["death", "sourced"],
  ["parents", "sourced"],
  ["marriage", "sourced"],
  ["children", "sourced"],
  ["residence", "sourced"],
  ["obituary", "sourced"],
]);
check("covered summary", app.evidenceCoverageSummary(covered), {
  sourced: 7,
  lead: 0,
  missing: 0,
  attention: 0,
  notApplicable: 0,
});

const thin = app.evidenceCoverage(app.state.data.people[5]);
check("thin profile statuses", thin.map((item) => [item.key, item.status]), [
  ["birth", "lead"],
  ["death", "missing"],
  ["parents", "lead"],
  ["marriage", "not-applicable"],
  ["children", "not-applicable"],
  ["residence", "lead"],
  ["obituary", "lead"],
]);

const conflict = app.evidenceCoverage(app.state.data.people[6]);
check("conflict adds review item", conflict[0], {
  key: "conflict",
  label: "Conflicts",
  status: "attention",
  detail: "Review conflicting or duplicate evidence",
});
check("status labels", ["sourced", "lead", "missing", "attention", "not-applicable"].map(app.evidenceStatusLabel),
  ["Sourced", "Lead", "Missing", "Review", "N/A"]);

if (failures) {
  console.error(`${failures} evidence coverage failure(s).`);
  process.exit(1);
}
console.log("evidence coverage test passed.");
