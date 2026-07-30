// Unit test for search-match reasons: when a term matches outside the name,
// the directory row should be able to say which field matched and show a
// word-boundary excerpt around the hit.
//
// Usage: node test/search-reason.test.mjs

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

const ada = {
  id: "smith",
  name: "Ada Smith",
  aliases: ["Ada Mae"],
  tags: ["immigrant"],
  birth: { place: "Galesburg, Illinois", date: "1871-03-02" },
  notes: "Census lists her household on Prairie Street.",
  profile: {
    summary:
      "Long after the family finished the slow move west across the plains, Ada worked as a carpenter alongside her brothers, building barns across two counties before settling down.",
  },
};

// Name hits need no explanation.
check("name hit has no reason", app.searchMatchReason(ada, "ada"), null);
check("empty term has no reason", app.searchMatchReason(ada, ""), null);

// Aliases and tags win before the longer text fields.
check("alias reason field", app.searchMatchReason(ada, "mae")?.field, "Also known as");
check("alias reason snippet", app.searchMatchReason(ada, "mae")?.snippet, "Ada Mae");
check("tag reason field", app.searchMatchReason(ada, "immigrant")?.field, "Tag");

// Places and notes report their field with the raw value.
check("birthplace field", app.searchMatchReason(ada, "galesburg")?.field, "Birth");
check("notes field", app.searchMatchReason(ada, "prairie")?.field, "Notes");

// Story hits excerpt around the term with ellipses at cut edges.
const story = app.searchMatchReason(ada, "carpenter");
check("story field", story?.field, "Life story");
check("story snippet includes term", story?.snippet.includes("carpenter"), true);
check("story snippet leading ellipsis", story?.snippet.startsWith("…"), true);
check("story snippet trailing ellipsis", story?.snippet.endsWith("…"), true);
check("story snippet is short", story?.snippet.length < ada.profile.summary.length, true);

// No hit anywhere returns null.
check("miss returns null", app.searchMatchReason(ada, "zeppelin"), null);

// matchSnippet keeps whole words and skips ellipses at true string edges.
const text = "worked as a carpenter in Galesburg";
const at = text.indexOf("carpenter");
const snippet = app.matchSnippet(text, at, "carpenter".length, 8);
check("snippet word boundary", snippet.includes("carpenter"), true);
check("snippet no broken lead word", /^…?[a-zA-Z]/.test(snippet), true);
const full = app.matchSnippet(text, 0, text.length, 8);
check("full-span snippet unmodified", full, text);

if (failures) {
  console.error(`search-reason test failed with ${failures} failure(s).`);
  process.exit(1);
}
console.log("search-reason test passed.");
