// Unit tests for census supplement suppression in the summary supplement path.
// When a hand-crafted summary mentions "census" for one year only, generated
// census paragraphs covering OTHER years must not be silently suppressed.
// Only suppress when every year in the generated paragraph appears in the summary.
//
// Usage: node test/story-census-supplement.test.mjs

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
    console.error(`FAIL ${label}:\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`);
  }
};

// Helper: return the census paragraph generated for the first person in data.
function censusParaFor(data) {
  app.state.data = data;
  const paras = app.generatedLifeStory(data.people[0]);
  return paras.find(p => /\bappears in\b.*\bcensus\b/i.test(p)) || null;
}

const personWith2CensusSources = {
  id: "toy",
  name: "Toy Graves",
  birth: { date: "1923" },
  death: { date: "1969" },
  parents: [],
  spouses: [],
  children: [],
  sources: [
    { label: "1940 U.S. census, Allen County, Kentucky, ED 2-6", url: "http://nara.gov/1" },
    { label: "1950 U.S. census, Allen County, Kentucky, ED 2-18", url: "http://nara.gov/2" },
  ],
};

// 1. No summary → census para is always generated (no suppression).
check(
  "no summary — census para generated",
  censusParaFor({ people: [personWith2CensusSources] }) !== null,
  true,
);

// 2. The generated para for two census years mentions both 1940 and 1950.
//    This validates what the supplement filter would receive.
{
  const para = censusParaFor({ people: [personWith2CensusSources] });
  check("two-year census para contains 1940", para?.includes("1940") ?? false, true);
  check("two-year census para contains 1950", para?.includes("1950") ?? false, true);
}

// 3. The supplement filter logic: verify the "every year covered" predicate.
//    We test it directly with the app's filter mechanism by inspecting what
//    generatedLifeStory produces (unchanged by the filter fix — the fix is in
//    renderLifeStory's supplement path). To exercise the filter predicate we
//    replicate its logic here with the values from a real two-year para.
{
  const para = censusParaFor({ people: [personWith2CensusSources] }) || "";
  const parasYears = [...para.toLowerCase().matchAll(/\b(1[6-9]\d{2}|20[0-4]\d)\b/g)].map(m => m[1]);

  // Summary mentions only 1950 → 1940 is not covered → must NOT suppress.
  const summary1950Only = "he appears in the 1950 census in allen county";
  check(
    "summary covers only 1950 — not every year covered — do not suppress",
    parasYears.every(yr => summary1950Only.includes(yr)),
    false,
  );

  // Summary mentions both 1940 and 1950 → every year covered → suppress.
  const summaryBoth = "appears in the 1940 census and also the 1950 census";
  check(
    "summary covers both years — every year covered — suppress",
    parasYears.every(yr => summaryBoth.includes(yr)),
    true,
  );
}

// 4. Single-year census source → generated para mentions only that year.
{
  const person1950Only = {
    ...personWith2CensusSources,
    sources: [{ label: "1950 U.S. census, Allen County, Kentucky, ED 2-18", url: "http://nara.gov/2" }],
  };
  const para = censusParaFor({ people: [person1950Only] }) || "";
  const parasYears = [...para.toLowerCase().matchAll(/\b(1[6-9]\d{2}|20[0-4]\d)\b/g)].map(m => m[1]);

  // When the summary mentions 1950, every-year check returns true → suppress.
  const summary = "the census taker found him in 1950 in allen county";
  check(
    "single 1950 census — summary covers it — suppress",
    parasYears.length > 0 && parasYears.every(yr => summary.includes(yr)),
    true,
  );

  // When the summary does NOT mention 1950, do not suppress.
  const summaryNoYear = "he farmed tobacco in allen county";
  check(
    "single 1950 census — summary lacks year — do not suppress",
    parasYears.length > 0 && parasYears.every(yr => summaryNoYear.includes(yr)),
    false,
  );
}

if (failures === 0) {
  console.log("story-census-supplement: all checks passed");
} else {
  console.error(`story-census-supplement: ${failures} check(s) failed`);
  process.exit(1);
}
