// Unit test for nextSearchMatch — Enter-in-search cycling. The first Enter
// selects the top-ranked hit; repeated presses step through the remaining
// matches and wrap, so duplicate family names can be walked without a mouse.
//
// Usage: node test/search-cycle.test.mjs

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

const matches = [{ id: "a" }, { id: "b" }, { id: "c" }];

// No current selection in the matches → start at the top hit.
check("first press", app.nextSearchMatch(matches, null)?.id, "a");
check("selection outside matches", app.nextSearchMatch(matches, "zz")?.id, "a");

// Repeated presses advance and wrap.
check("advance from a", app.nextSearchMatch(matches, "a")?.id, "b");
check("advance from b", app.nextSearchMatch(matches, "b")?.id, "c");
check("wrap from c", app.nextSearchMatch(matches, "c")?.id, "a");

// Single match keeps re-selecting itself; empty match list yields null.
check("single match", app.nextSearchMatch([{ id: "solo" }], "solo")?.id, "solo");
check("no matches", app.nextSearchMatch([], "a"), null);

// End-to-end with ranked search: duplicate names cycle in rank order.
app.state.data = {
  people: [
    { id: "je1", name: "John Edwards", birth: { date: "1850" } },
    { id: "amy", name: "Amy Zimmer" },
    { id: "je2", name: "John Edwards", birth: { date: "1878" } },
  ],
};
const ranked = app.searchMatches("john edwards");
check("ranked match count", ranked.length, 2);
const first = app.nextSearchMatch(ranked, "amy");
const second = app.nextSearchMatch(ranked, first.id);
const third = app.nextSearchMatch(ranked, second.id);
check("cycle covers both namesakes", new Set([first.id, second.id]).size, 2);
check("cycle wraps back", third.id, first.id);

if (failures) {
  console.error(`Search cycle test FAILED (${failures} case${failures === 1 ? "" : "s"}).`);
  process.exit(1);
}
console.log("Search cycle test passed.");
