// Unit tests for marriage year in the generated life story.
// Covers: sourced year, estimated year from first child, multiple spouses
// with mixed year availability, and the no-year fallback.
//
// Usage: node test/story-marriage-year.test.mjs

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
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
};

// Helper: load data and get the generated story paragraphs for the first person
function storyFor(data) {
  app.state.data = data;
  return app.generatedLifeStory(data.people[0]);
}

// 1. Single spouse with a marriage-record source → "married X in YEAR"
check(
  "single spouse with marriage source year",
  storyFor({
    people: [
      {
        id: "john",
        name: "John Smith",
        birth: { date: "1880" },
        spouses: ["jane"],
        parents: [],
        children: ["kid1"],
        sources: [{ label: "1905 Marriage Certificate", url: "http://example.com/m" }],
      },
      { id: "jane", name: "Jane Doe", parents: [], children: ["kid1"], spouses: ["john"] },
      { id: "kid1", name: "Sam Smith", birth: { date: "1906" }, parents: ["john", "jane"], children: [] },
    ],
  })[1],
  "John married Jane Doe in 1905, at age 25.",
);

// 2. Single spouse, no source, child born 1907 → estimated "around 1906"
check(
  "single spouse with estimated year from child",
  storyFor({
    people: [
      {
        id: "john",
        name: "John Smith",
        birth: { date: "1880" },
        spouses: ["jane"],
        parents: [],
        children: ["kid1"],
      },
      { id: "jane", name: "Jane Doe", parents: [], children: ["kid1"], spouses: ["john"] },
      { id: "kid1", name: "Sam Smith", birth: { date: "1907" }, parents: ["john", "jane"], children: [] },
    ],
  })[1],
  "John married Jane Doe around 1906, at about age 26.",
);

// 3. Single spouse, no source, no children → bare "married X"
check(
  "single spouse no year available",
  storyFor({
    people: [
      {
        id: "john",
        name: "John Smith",
        birth: { date: "1880" },
        spouses: ["jane"],
        parents: [],
        children: [],
      },
      { id: "jane", name: "Jane Doe", parents: [], children: [], spouses: ["john"] },
    ],
  })[1],
  "John married Jane Doe.",
);

// 4. Two spouses: first has sourced year on spouse record, second estimated
check(
  "two spouses — sourced first, estimated second",
  storyFor({
    people: [
      {
        id: "john",
        name: "John Smith",
        birth: { date: "1880" },
        spouses: ["jane", "mary"],
        parents: [],
        children: ["kid1", "kid2"],
      },
      {
        id: "jane",
        name: "Jane Doe",
        parents: [],
        children: ["kid1"],
        spouses: ["john"],
        sources: [{ label: "1905 Marriage Record, Indiana", url: "http://example.com/m1" }],
      },
      { id: "mary", name: "Mary Brown", parents: [], children: ["kid2"], spouses: ["john"] },
      { id: "kid1", name: "Sam Smith", birth: { date: "1906" }, parents: ["john", "jane"], children: [] },
      { id: "kid2", name: "Tom Smith", birth: { date: "1920" }, parents: ["john", "mary"], children: [] },
    ],
  })[1],
  "John first married Jane Doe (1905, age 25), and later married Mary Brown (c. 1919, about age 39).",
);

// 5. Two spouses listed in reverse order in data (second married first) — should
//    still produce "first married … later married …" after chronological sort.
check(
  "two spouses — data order reversed relative to marriage years",
  storyFor({
    people: [
      {
        id: "john",
        name: "John Smith",
        birth: { date: "1880" },
        spouses: ["mary", "jane"],
        parents: [],
        children: ["kid1", "kid2"],
      },
      {
        id: "jane",
        name: "Jane Doe",
        parents: [],
        children: ["kid1"],
        spouses: ["john"],
        sources: [{ label: "1905 Marriage Record, Indiana", url: "http://example.com/m1" }],
      },
      {
        id: "mary",
        name: "Mary Brown",
        parents: [],
        children: ["kid2"],
        spouses: ["john"],
        sources: [{ label: "1920 Marriage Record, Ohio", url: "http://example.com/m2" }],
      },
      { id: "kid1", name: "Sam Smith", birth: { date: "1906" }, parents: ["john", "jane"], children: [] },
      { id: "kid2", name: "Tom Smith", birth: { date: "1921" }, parents: ["john", "mary"], children: [] },
    ],
  })[1],
  "John first married Jane Doe (1905, age 25), and later married Mary Brown (1920, age 40).",
);

// Dangling spouse reference — spouses[] contains an id not present in people[].
// The marriage paragraph should be silently omitted rather than "John married undefined.".
check(
  "single dangling spouse reference — no marriage paragraph",
  storyFor({
    people: [
      {
        id: "john",
        name: "John Smith",
        birth: { date: "1880" },
        death: { date: "1950" },
        spouses: ["ghost"],
        parents: [],
        children: [],
        sources: [],
      },
    ],
  }).some((p) => p.includes("undefined") || p.includes("They")),
  false,
);

if (failures === 0) {
  console.log("story-marriage-year: all checks passed");
} else {
  console.error(`story-marriage-year: ${failures} check(s) failed`);
  process.exit(1);
}
