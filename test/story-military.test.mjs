// Unit tests for military paragraph in the generated life story.
// Covers: "veteran" tag, "veteran flag" tag, BIRLS source, branch detection,
// and WWI/WWII draft registration.
//
// Usage: node test/story-military.test.mjs

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

function militaryParaFor(person, extra = []) {
  app.state.data = { people: [person, ...extra] };
  const paras = app.generatedLifeStory(person);
  return paras.find((p) => /served|registered.*draft/i.test(p)) || null;
}

const base = {
  id: "p1",
  name: "John Doe",
  birth: { date: "1900" },
  death: { date: "1960" },
  parents: [],
  spouses: [],
  children: [],
  tags: [],
  sources: [],
};

// 1. No military info → no paragraph
check(
  "no military info",
  militaryParaFor({ ...base }),
  null,
);

// 2. Exact "veteran" tag → generic service sentence
check(
  "veteran tag",
  militaryParaFor({ ...base, tags: ["veteran"] }),
  "John served in the U.S. military.",
);

// 3. "veteran flag" tag → generic service sentence (Find a Grave flag marker)
check(
  "veteran flag tag",
  militaryParaFor({ ...base, tags: ["veteran flag"] }),
  "John served in the U.S. military.",
);

// 4. "Veteran Flag" tag (different capitalisation) → same
check(
  "Veteran Flag capitalisation",
  militaryParaFor({ ...base, tags: ["Veteran Flag"] }),
  "John served in the U.S. military.",
);

// 5. BIRLS source → service sentence
check(
  "BIRLS source",
  militaryParaFor({
    ...base,
    sources: [{ label: "VA BIRLS Death File" }],
  }),
  "John served in the U.S. military.",
);

// 6. veteran tag + USAF mention in source label → Air Force branch
check(
  "veteran + USAF source",
  militaryParaFor({
    ...base,
    tags: ["veteran"],
    sources: [{ label: "Find a Grave memorial (USAF corporal)" }],
  }),
  "John served in the U.S. Air Force.",
);

// 7. WWII draft card source → draft registration sentence
check(
  "WWII draft card",
  militaryParaFor({
    ...base,
    sources: [{ label: "World War II draft registration card, 1940-1947" }],
  }),
  "John registered for the World War II draft.",
);

// 8. WWI draft card source → draft registration sentence
check(
  "WWI draft card",
  militaryParaFor({
    ...base,
    sources: [{ label: "World War I draft registration card, 1917-1918" }],
  }),
  "John registered for the World War I draft.",
);

// 9. Both WWII draft and veteran tag → both sentences
check(
  "WWII draft + veteran",
  militaryParaFor({
    ...base,
    tags: ["veteran"],
    sources: [{ label: "World War II draft registration card, 1940-1947" }],
  }),
  "John registered for the World War II draft. John served in the U.S. military.",
);

if (failures === 0) {
  console.log("story-military: all checks passed");
} else {
  console.error(`story-military: ${failures} check(s) failed`);
  process.exit(1);
}
