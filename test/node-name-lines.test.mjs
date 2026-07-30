// Unit test for nodeNameLines — tree-card names wrap onto a balanced second
// line instead of truncating at 25 characters.
//
// Usage: node test/node-name-lines.test.mjs

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

const cases = [
  // Short names stay on one line, untouched.
  ["Mary Graves", ["Mary Graves"]],
  ["Anderson Andrew Graves", ["Anderson", "Andrew Graves"]],
  // The break lands at the word boundary that best balances the halves.
  ["Margaret Elizabeth (Graves) Johnson", ["Margaret Elizabeth", "(Graves) Johnson"]],
  ["Wilhelmina \"Minnie\" Vandenberg Smith", ["Wilhelmina \"Minnie\"", "Vandenberg Smith"]],
  // A single unbreakable word still truncates rather than overflowing.
  ["Wolfeschlegelsteinhausenbergerdorff", ["Wolfeschlegelsteinha..."]],
  // Whitespace is normalized before measuring.
  ["  Mary   Graves  ", ["Mary Graves"]],
  ["", [""]],
];

let failures = 0;
for (const [input, expected] of cases) {
  const actual = app.nodeNameLines(input);
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) {
    failures += 1;
    console.error(`FAIL nodeNameLines(${JSON.stringify(input)}) -> ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// Every wrapped line must respect the per-line limit so cards never overflow.
for (const [input] of cases) {
  for (const line of app.nodeNameLines(input)) {
    if (line.length > 24) {
      failures += 1;
      console.error(`FAIL line too long for card: ${JSON.stringify(line)} from ${JSON.stringify(input)}`);
    }
  }
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log(`node-name-lines: all ${cases.length} cases passed`);
