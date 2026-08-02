// Unit tests for extractCensusLocation — the helper that pulls a county/state
// out of census source labels so the generated life story can name the place.
//
// Usage: node test/census-location.test.mjs

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
const { extractCensusLocation } = app;

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

// Standard NARA/Ancestry detailed label with ED
check(
  "county+state from detailed NARA label",
  extractCensusLocation("1950 U.S. census, Allen County, Kentucky, ED 2-18, sheet 11, dwelling 71"),
  "Allen County, Kentucky",
);

// Another county/state
check(
  "county+state from Warren County label",
  extractCensusLocation("1950 U.S. census, Warren County, Kentucky, ED 114-12, sheet 8, dwelling 733"),
  "Warren County, Kentucky",
);

// Florida county
check(
  "county+state from Bradford County Florida",
  extractCensusLocation("1950 U.S. census, Bradford County, Florida"),
  "Bradford County, Florida",
);

// 1940 format
check(
  "county+state from 1940 census label",
  extractCensusLocation("1940 U.S. census, Allen County, Kentucky, ED 2-6, sheet 10B, household 243"),
  "Allen County, Kentucky",
);

// Abbreviated format (Allen Co KY)
check(
  "abbreviated county from Allen Co KY label",
  extractCensusLocation("1950 US Census, Allen Co KY, ED 2-1 sheet 22, dwelling 272 (NARA image, free)"),
  "Allen Co KY",
);

// NARA viewer format
check(
  "county from NARA viewer label",
  extractCensusLocation("NARA 1950 census viewer, Allen County KY ED 2-18 (browse to sheet 11)"),
  "Allen County KY",
);

// NARA search result format
check(
  "county from NARA search result label",
  extractCensusLocation("NARA 1950 census search result for Balous Edwards, Bradford County FL"),
  "Bradford County FL",
);

// Ancestry generic label — no location
check(
  "no location from generic Ancestry label",
  extractCensusLocation("Ancestry source: 1950 United States Federal Census"),
  null,
);

// Ancestry 1930 label — no location
check(
  "no location from generic 1930 Ancestry label",
  extractCensusLocation("Ancestry source: 1930 United States Federal Census"),
  null,
);

// Null/empty input
check("null input returns null", extractCensusLocation(null), null);
check("empty string returns null", extractCensusLocation(""), null);
check("non-census label returns null", extractCensusLocation("Danny Graves obituary, Bowling Green Daily News"), null);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("census-location.test.mjs passed");
