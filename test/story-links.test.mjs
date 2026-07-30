// Unit test for life-story person links: verbatim full-name mentions of
// other tree people become clickable, longest names win overlaps, single
// given names never link, and ambiguous namesakes only link when exactly
// one candidate is a close relative of the profile person.
//
// Usage: node test/story-links.test.mjs

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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
};

app.state.data = {
  people: [
    { id: "self", name: "Rufus Graves", parents: ["anderson"], spouses: ["bertie"], children: [] },
    { id: "anderson", name: "Anderson Andrew Graves", children: ["self", "virgil"] },
    { id: "bertie", name: 'Bertie "Bee" E. (Meador) Graves' },
    { id: "virgil", name: "Virgil Graves", parents: ["anderson"] },
    { id: "mary", name: "Mary Ann Graves" },
    { id: "ann", name: "Ann Graves" },
    // Two unrelated namesakes: mentions of this name must stay plain text.
    { id: "js1", name: "John Smith" },
    { id: "js2", name: "John Smith" },
    // Namesake pair where one is a close relative (child of anderson? no —
    // spouse of self), so the mention resolves to the relative.
    { id: "gg-far", name: "George Gray" },
    { id: "gg-near", name: "George Gray", parents: ["anderson"] },
  ],
};

const self = app.state.data.people[0];
const nameIndex = app.storyNameIndex();
const closeIds = app.closeRelativeIds(self);

// Stripped variants drop quoted nicknames and parenthesized maiden names.
check("stripped name", app.strippedName('Bertie "Bee" E. (Meador) Graves'), "Bertie E. Graves");

const mentions = (text) =>
  app.storyMentions(text, self.id, nameIndex, closeIds).map((m) => [text.slice(m.start, m.end), m.id]);

// Plain mention links, self-mentions stay text, single given names never link.
check(
  "basic mention",
  mentions("Rufus Graves was the son of Anderson Andrew Graves. Anderson farmed."),
  [["Anderson Andrew Graves", "anderson"]],
);

// Stripped nickname/maiden variant matches prose.
check("stripped variant", mentions("He married Bertie E. Graves in 1903."), [["Bertie E. Graves", "bertie"]]);

// Longest name wins overlaps: "Mary Ann Graves" must not also link "Ann Graves".
check("longest wins", mentions("His cousins Mary Ann Graves and Ann Graves visited."), [
  ["Mary Ann Graves", "mary"],
  ["Ann Graves", "ann"],
]);

// Word boundaries: "Ann Gravesend" is not "Ann Graves".
check("word boundary", mentions("The town of Ann Gravesend grew."), []);

// Ambiguous namesakes with no close relative stay plain text.
check("ambiguous skipped", mentions("A neighbor named John Smith helped."), []);

// Ambiguous namesakes resolve when exactly one is a close relative (sibling).
check("ambiguous resolves to relative", mentions("His brother George Gray moved west."), [
  ["George Gray", "gg-near"],
]);

// Close relatives include parents, spouses, children, and siblings.
check("close ids", [...closeIds].sort(), ["anderson", "bertie", "gg-near", "virgil"]);

if (failures) {
  console.error(`story-links test failed with ${failures} failure(s).`);
  process.exit(1);
}
console.log("story-links test passed.");
