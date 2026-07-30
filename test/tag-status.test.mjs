// Unit test for the research-status tag classification — the colored pills
// that surface confidence markers ("needs direct source", "obituary
// verified", "date conflict") in the profile header and directory rows.
//
// Usage: node test/tag-status.test.mjs

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
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// Tone classification per tag.
check("needs direct source is a lead", app.tagStatusTone("needs direct source"), "status-lead");
check("Ancestry tree lead is a lead", app.tagStatusTone("Ancestry tree lead"), "status-lead");
check("probable is a lead", app.tagStatusTone("probable"), "status-lead");
check("living/status unknown is a lead", app.tagStatusTone("living/status unknown"), "status-lead");
check("obituary verified is verified", app.tagStatusTone("obituary verified"), "status-verified");
check("sourced is verified", app.tagStatusTone("sourced"), "status-verified");
check("sourced via child obituaries is verified", app.tagStatusTone("sourced via child obituaries"), "status-verified");
check("memorial corroborated is verified", app.tagStatusTone("memorial corroborated"), "status-verified");
check("date conflict needs attention", app.tagStatusTone("date conflict"), "status-attention");
check("possible duplicate is attention, not lead", app.tagStatusTone("possible duplicate"), "status-attention");
check("branch tags stay neutral", app.tagStatusTone("Graves branch"), "");
check("census-origin tags stay neutral", app.tagStatusTone("1940 census source"), "");
check("'needs direct source' is not verified", app.tagStatusTone("needs direct source") !== "status-verified", true);

// Rank drives directory-row ordering: status tags before neutral ones.
check("attention ranks before verified", app.tagStatusRank("date conflict") < app.tagStatusRank("sourced"), true);
check("verified ranks before lead", app.tagStatusRank("sourced") < app.tagStatusRank("Ancestry tree lead"), true);
check("lead ranks before neutral", app.tagStatusRank("Ancestry tree lead") < app.tagStatusRank("Graves branch"), true);

// Header pills: one per tone, most urgent first, extras in the tooltip.
const pills = app.researchStatusPills({
  tags: ["Ancestry tree lead", "needs direct source", "Graves branch", "date conflict"],
});
check("one pill per tone", pills.length, 2);
check("most urgent tone first", pills[0].className.includes("status-attention"), true);
check("lead pill shows the first lead tag", pills[1].textContent, "Ancestry tree lead");
check("same-tone extras land in the tooltip", pills[1].title,
  'Ancestry tree lead · needs direct source — click to find everyone tagged "Ancestry tree lead"');
check("no tags means no pills", app.researchStatusPills({ tags: ["Graves branch"] }).length, 0);
check("missing tags array is safe", app.researchStatusPills({}).length, 0);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("Tag status test passed.");
