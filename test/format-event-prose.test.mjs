// Unit tests for formatEventProse — the prose-friendly formatter used in
// generated life story sentences. Unlike formatEvent's " · " separator,
// this joins with ", in " so sentences read naturally and place-only events
// include the grammatically required "in" preposition.
//
// Usage: node test/format-event-prose.test.mjs

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
const { formatEventProse, trimPlaceAnnotations } = app;

let failures = 0;
function check(name, actual, expected) {
  const pass = actual === expected;
  if (!pass) {
    failures += 1;
    console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok ${name}`);
  }
}

// Full ISO date + place → prose with comma-in
check(
  "date and place joined with comma-in",
  formatEventProse({ date: "1923-02-06", place: "Kentucky, USA" }),
  "February 6, 1923, in Kentucky",
);

// Year-only date + place
check(
  "year-only date and place",
  formatEventProse({ date: "1969", place: "Allen County, Kentucky" }),
  "1969, in Allen County, Kentucky",
);

// Date only (no place) — no "in" appended
check(
  "date only stays as date",
  formatEventProse({ date: "1923-02-06", place: "" }),
  "February 6, 1923",
);

// Place only (no date) — prepends "in" so "was born in Place" reads grammatically
check(
  "place only prefixed with in",
  formatEventProse({ date: "", place: "Kentucky, USA" }),
  "in Kentucky",
);

// Both empty → empty string (falsy)
check(
  "both empty returns empty string",
  formatEventProse({ date: "", place: "" }),
  "",
);

// Null event → empty string
check(
  "null event returns empty string",
  formatEventProse(null),
  "",
);

// Approximate date passes through unchanged
check(
  "approximate date passes through",
  formatEventProse({ date: "about 1897", place: "Allen County, KY" }),
  "about 1897, in Allen County, KY",
);

// Month-year date
check(
  "month-year date and place",
  formatEventProse({ date: "1923-02", place: "Kentucky" }),
  "February 1923, in Kentucky",
);

// Research annotation stripping in prose place strings
check(
  "strips (lead) parenthetical from place",
  trimPlaceAnnotations("Sumner County, Tennessee (lead) or Kentucky"),
  "Sumner County, Tennessee",
);
check(
  "strips parenthetical context note from place",
  trimPlaceAnnotations("Warren County, Kentucky (resident of Allen County)"),
  "Warren County, Kentucky",
);
check(
  "strips parish parenthetical from place",
  trimPlaceAnnotations("Dublin, Ireland (Brookshire, Lamborne)"),
  "Dublin, Ireland",
);
check(
  "plain place unchanged by annotation stripper",
  trimPlaceAnnotations("Allen County, Kentucky, USA"),
  "Allen County, Kentucky",
);
check(
  "annotation stripping flows through formatEventProse",
  formatEventProse({ date: "1892", place: "Sumner County, Tennessee (lead) or Kentucky" }),
  "1892, in Sumner County, Tennessee",
);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("format-event-prose.test.mjs passed");
