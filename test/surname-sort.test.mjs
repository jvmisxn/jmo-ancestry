// Unit test for surnameSortKey — the people-directory browse order. Sorting by
// surname keeps families grouped together instead of scattering siblings
// across a first-name alphabet. Guards suffix, nickname, and maiden-name
// handling so "John Smith Jr." files under Smith, not Jr.
//
// Usage: node test/surname-sort.test.mjs

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

const keyCases = [
  ["John Smith", "smith john"],
  ["John Smith Jr.", "smith john"],
  ["Robert Miller III", "miller robert"],
  ['William "Bill" Turner', "turner william"],
  ["Mary (Smith) Jones", "jones mary"],
  ["Madonna", "madonna"],
  ["", ""],
];

let failures = 0;
for (const [name, expected] of keyCases) {
  const actual = app.surnameSortKey(name);
  if (actual !== expected) {
    failures += 1;
    console.error(`surnameSortKey(${JSON.stringify(name)}) => ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// Directory order: siblings sharing a surname stay adjacent, suffixes do not
// break the grouping, and ties fall back to full-name order.
app.state.data = {
  people: [
    { id: "a", name: "Zach Adams" },
    { id: "b", name: "Amy Zimmer" },
    { id: "c", name: "Ben Adams Jr." },
    { id: "d", name: "Carl Zimmer" },
  ],
};
const browseOrder = app.searchMatches("").map((person) => person.name);
const expectedOrder = ["Ben Adams Jr.", "Zach Adams", "Amy Zimmer", "Carl Zimmer"];
if (JSON.stringify(browseOrder) !== JSON.stringify(expectedOrder)) {
  failures += 1;
  console.error(`browse order ${JSON.stringify(browseOrder)}, expected ${JSON.stringify(expectedOrder)}`);
}

// Directory group headers: surnameLabel mirrors the sort key's handling but
// keeps the original casing for display.
const labelCases = [
  ["John Smith", "Smith"],
  ["John Smith Jr.", "Smith"],
  ['William "Bill" Turner', "Turner"],
  ["Mary (Smith) Jones", "Jones"],
  ["Madonna", "Madonna"],
  ["", ""],
];
for (const [name, expected] of labelCases) {
  const actual = app.surnameLabel(name);
  if (actual !== expected) {
    failures += 1;
    console.error(`surnameLabel(${JSON.stringify(name)}) => ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// Search haystack now includes dates, so a year query finds people.
app.state.data = {
  people: [
    { id: "a", name: "Zach Adams", birth: { date: "1897-03-04" } },
    { id: "b", name: "Amy Zimmer", death: { date: "about 1954" } },
  ],
};
const yearHits = app.searchMatches("1897").map((person) => person.id);
if (JSON.stringify(yearHits) !== JSON.stringify(["a"])) {
  failures += 1;
  console.error(`search "1897" hit ${JSON.stringify(yearHits)}, expected ["a"]`);
}
const fuzzyYearHits = app.searchMatches("1954").map((person) => person.id);
if (JSON.stringify(fuzzyYearHits) !== JSON.stringify(["b"])) {
  failures += 1;
  console.error(`search "1954" hit ${JSON.stringify(fuzzyYearHits)}, expected ["b"]`);
}

if (failures) {
  console.error(`Surname sort test FAILED (${failures} case${failures === 1 ? "" : "s"}).`);
  process.exit(1);
}
console.log(`Checked ${keyCases.length} key cases plus browse order and year search.`);
console.log("Surname sort test passed.");
