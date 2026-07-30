// Unit test for clickable tag pills — profile tags run a tag search on
// click, so branch tags ("Graves branch") and research-status tags act as
// one-click filters across the directory and tree.
//
// Usage: node test/tag-search.test.mjs

globalThis.__JMO_HEADLESS_TEST__ = true;

const stubEl = (tag = "div") => {
  const el = {
    tagName: tag,
    children: [],
    listeners: {},
    addEventListener(type, fn) { (el.listeners[type] ||= []).push(fn); },
    setAttribute() {},
    removeAttribute() {},
    replaceChildren() {},
    append(...kids) { el.children.push(...kids); },
    classList: { toggle() {}, add() {}, remove() {} },
    style: {},
    textContent: "",
    value: "",
    hidden: false,
  };
  return el;
};

// querySelector caches per selector so the test can inspect the same element
// objects the app wired up (e.g. the search input).
const bySelector = new Map();
globalThis.document = {
  querySelector: (selector) => {
    if (!bySelector.has(selector)) bySelector.set(selector, stubEl());
    return bySelector.get(selector);
  },
  createElement: (tag) => stubEl(tag),
  createElementNS: (ns, tag) => stubEl(tag),
  createDocumentFragment: () => stubEl("fragment"),
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

// metaPill stays a plain span without a handler, becomes a button with one.
const plain = app.metaPill("1968-2003");
check("plain pill is a span", plain.tagName, "span");
check("plain pill is not clickable", plain.className.includes("clickable"), false);
check("plain pill has no click listener", (plain.listeners.click || []).length, 0);

let clicked = 0;
const live = app.metaPill("Graves branch", "", () => { clicked += 1; });
check("clickable pill is a button", live.tagName, "button");
check("clickable pill is marked clickable", live.className.includes("clickable"), true);
check("clickable pill keeps the base class", live.className.includes("meta-pill"), true);
live.listeners.click[0]();
check("clicking the pill fires the handler", clicked, 1);

// tagListFact renders only neutral tags as clickable pills; status-toned tags
// already appear as header pills and "sample" is internal.
app.state.data = {
  people: [
    { id: "a", name: "Ada Graves", tags: ["Graves branch", "needs direct source", "sample"] },
    { id: "b", name: "Ben Graves", tags: ["Graves branch"] },
  ],
};
const fact = app.tagListFact(app.state.data.people[0]);
const [dt, dd] = fact.children;
check("fact renders a Tags label", dt?.textContent, "Tags");
check("only the neutral tag becomes a pill", dd?.children.length, 1);
check("pill carries the tag text", dd?.children[0].textContent, "Graves branch");
check("pill explains the click", dd?.children[0].title, 'Find everyone tagged "Graves branch"');
check("pill is clickable", (dd?.children[0].listeners.click || []).length, 1);
check("status-only tags render nothing",
  app.tagListFact({ tags: ["needs direct source"] }).children.length, 0);
check("missing tags array is safe", app.tagListFact({}).children.length, 0);

// searchByTag drops the tag into the search box and opens the directory.
app.state.peopleCollapsed = true;
dd.children[0].listeners.click[0]();
const search = document.querySelector("#person-search");
check("clicking a tag pill fills the search box", search.value, "Graves branch");
check("clicking a tag pill opens the people directory", app.state.peopleCollapsed, false);
check("desktop keeps the profile open", app.state.profileCollapsed, false);
check("the tag search matches everyone sharing the tag",
  app.searchMatches("graves branch").map((person) => person.id), ["a", "b"]);

// On compact viewports the profile collapses so the results are visible.
window.innerWidth = 500;
app.state.profileCollapsed = false;
app.searchByTag("Graves branch");
check("compact viewport collapses the profile", app.state.profileCollapsed, true);

// Status pills in the profile header are clickable too.
const pills = app.researchStatusPills({ tags: ["Ancestry tree lead", "needs direct source"] });
check("status pill is a button", pills[0].tagName, "button");
check("status pill searches its first tag", (pills[0].listeners.click || []).length, 1);
pills[0].listeners.click[0]();
check("status pill click fills the search box", search.value, "Ancestry tree lead");

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("Tag search test passed.");
