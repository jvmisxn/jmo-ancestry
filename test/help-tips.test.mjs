// The Tips popover is driven by HELP_TIPS; these checks keep the list honest:
// every entry is complete, the documented hidden interactions stay covered,
// and renderHelpTips emits one row per tip with kbd chips for every key.

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
  createElement: (tag) => {
    const el = stubEl();
    el.tagName = tag.toUpperCase();
    el.children = [];
    el.append = (...kids) => el.children.push(...kids.filter((kid) => typeof kid !== "string"));
    return el;
  },
  createElementNS: () => stubEl(),
  body: { classList: { toggle() {} } },
};
globalThis.window = {
  addEventListener() {},
  innerWidth: 1440,
  location: { hash: "" },
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { hash: "" };
globalThis.requestAnimationFrame = (fn) => fn;

const { __test: app } = await import("../src/app.js");

let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};

const { HELP_TIPS } = app;
assert(Array.isArray(HELP_TIPS) && HELP_TIPS.length >= 3, "HELP_TIPS has grouped areas");

const areas = HELP_TIPS.map((group) => group.area);
assert(new Set(areas).size === areas.length, "area names are unique");

const allTips = HELP_TIPS.flatMap((group) => group.tips);
for (const group of HELP_TIPS) {
  assert(typeof group.area === "string" && group.area.length > 0, "every group is labeled");
  assert(Array.isArray(group.tips) && group.tips.length > 0, `group ${group.area} has tips`);
}
for (const tip of allTips) {
  assert(Array.isArray(tip.keys) && tip.keys.length > 0 && tip.keys.every((key) => key.length > 0),
    `tip "${tip.does}" names its keys`);
  assert(typeof tip.does === "string" && tip.does.length > 0, "every tip explains what it does");
}

// The interactions that exist in the app but are invisible in the UI must
// stay documented; if one of these fails, the popover drifted from the code.
const text = allTips.map((tip) => `${tip.keys.join("+")} ${tip.does}`.toLowerCase()).join("\n");
for (const needle of ["double-click", "shift", "enter", "esc", "tab", "cycle", "?"]) {
  assert(text.includes(needle), `tips cover "${needle}"`);
}
assert(allTips.some((tip) => tip.keys.includes("↑")), "tips cover arrow-key walking");

// renderHelpTips: one heading per group, one row per tip, kbd chip per key.
const container = document.createElement("div");
app.renderHelpTips(container);
const headings = container.children.filter((el) => el.tagName === "H3");
const rows = container.children.filter((el) => el.className === "help-tip");
assert(headings.length === HELP_TIPS.length, "one heading per area");
assert(rows.length === allTips.length, "one row per tip");
rows.forEach((row, index) => {
  const [keys, does] = row.children;
  const kbds = keys.children.filter((el) => el.tagName === "KBD");
  assert(kbds.length === allTips[index].keys.length, `row ${index} has a kbd per key`);
  assert(does.textContent === allTips[index].does, `row ${index} carries its description`);
});

console.log(`help-tips: ${checks} checks passed`);
