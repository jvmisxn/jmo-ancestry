// Unit test for life-story search: a term that only appears in a person's
// profile summary/article should still find them, ranked below name hits.
//
// Usage: node test/search-story.test.mjs

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
    console.error(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
};

app.state.data = {
  people: [
    {
      id: "smith",
      name: "Ada Smith",
      profile: { summary: "Ada worked as a carpenter in Galesburg before the family moved west." },
    },
    {
      id: "jones",
      name: "Ben Jones",
      profile: { article: ["Ben ran the Galesburg mill.", "He later farmed in Iowa."] },
    },
    {
      id: "carpenter",
      name: "Cora Carpenter",
      profile: { summary: "Cora's records are still sparse." },
    },
    {
      id: "quiet",
      name: "Dan Quiet",
    },
  ],
};

// storyText flattens summary strings and article paragraph arrays.
check("summary text", app.storyText(app.state.data.people[0]).includes("carpenter"), true);
check("article array text", app.storyText(app.state.data.people[1]).includes("farmed in Iowa"), true);
check("missing profile", app.storyText(app.state.data.people[3]), "");

// A story-only term finds the person.
const carpenter = app.searchMatches("carpenter").map((p) => p.id);
check("story term matches", carpenter.includes("smith"), true);
check("story term skips others", carpenter.includes("jones"), false);

// Name hits still outrank story hits for the same term.
check("name hit ranked first", carpenter[0], "carpenter");

// Terms only in an article paragraph array match too.
const mill = app.searchMatches("mill").map((p) => p.id);
check("article term matches", mill.includes("jones"), true);

// Unmatched terms still return nothing.
check("no match", app.searchMatches("zeppelin").length, 0);

if (failures) {
  console.error(`search-story test failed with ${failures} failure(s).`);
  process.exit(1);
}
console.log("search-story test passed.");
