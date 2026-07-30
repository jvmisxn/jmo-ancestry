// Unit test for sourceRepositoryName/cleanSourceLabel — the repository badge on
// sources-panel entries and the label cleanup that strips repetitive
// "Ancestry source:"-style prefixes once the badge carries that information.
//
// Usage: node test/source-badge.test.mjs

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
const check = (name, actual, expected) => {
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL ${name}: expected "${expected}", got "${actual}"`);
  }
};

const repoCases = [
  ["https://www.ancestry.com/search/collections/62209/records/292803329", "Ancestry"],
  ["https://www.findagrave.com/memorial/87068191/patricia", "Find a Grave"],
  ["https://www.familysearch.org/tree/person/details/ABCD-123", "FamilySearch"],
  ["https://www.newspapers.com/image/12345/", "Newspapers.com"],
  ["https://chroniclingamerica.loc.gov/lccn/sn83045462/", "Chronicling America"],
  ["https://1950census.archives.gov/search/?name=Smith", "National Archives"],
  // Unknown hosts fall back to the bare hostname so the badge is never empty
  // for a valid link.
  ["https://www.example-county-archive.org/deeds/44", "example-county-archive.org"],
  ["not a url", ""],
  ["", ""],
  [undefined, ""],
];
for (const [url, expected] of repoCases) {
  check(`repository(${url})`, app.sourceRepositoryName(url), expected);
}

const labelCases = [
  // The badge already says Ancestry, so the prefix goes.
  [["Ancestry source: U.S., School Yearbooks, 1900-2016", "Ancestry"], "U.S., School Yearbooks, 1900-2016"],
  [["Ancestry record: 1940 United States Federal Census", "Ancestry"], "1940 United States Federal Census"],
  [["ancestry: Texas Death Certificates", "Ancestry"], "Texas Death Certificates"],
  // Labels that merely mention the repository mid-sentence stay untouched.
  [["Find a Grave memorial 87068191 (includes obituary)", "Find a Grave"], "Find a Grave memorial 87068191 (includes obituary)"],
  [["Marriage license, Bexar County", "Ancestry"], "Marriage license, Bexar County"],
  // A label that is nothing but the prefix keeps its original text.
  [["Ancestry source:", "Ancestry"], "Ancestry source:"],
  [["Obituary scan", ""], "Obituary scan"],
  [[undefined, "Ancestry"], ""],
];
for (const [[label, repo], expected] of labelCases) {
  check(`clean(${label} | ${repo})`, app.cleanSourceLabel(label, repo), expected);
}

if (failures) {
  console.error(`${failures} source badge case(s) failed.`);
  process.exit(1);
}
console.log(`All ${repoCases.length + labelCases.length} source badge cases passed.`);
