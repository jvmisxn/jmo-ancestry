// Unit test for sourceEventYear — deriving a timeline year for sources that
// have no explicit date field by reading the year out of the label. Guards:
// explicit dates still win, collection spans ("1780-2002") and research/access
// dates outside the lifetime are ignored, and the death-year+1 window keeps
// obituaries while dropping later index entries.
//
// Usage: node test/source-event-year.test.mjs

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
function check(name, actual, expected) {
  const pass = actual === expected;
  if (!pass) {
    failures += 1;
    console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok ${name}`);
  }
}

const year = (source, birth = 1900, death = 1969) => app.sourceEventYear(source, birth, death);

check("explicit date wins over label", year({ date: "1910", label: "1950 census" }), 1910);
check("label census year inside lifetime", year({ label: "1950 U.S. census, Allen County, Kentucky, ED 2-18" }), 1950);
check("collection span is skipped", year({ label: "Ancestry source: Tennessee, U.S., Marriage Records, 1780-2002" }), null);
check("decade suffix is skipped", year({ label: "U.S., Newspapers.com Birth Index, 1800s-2005" }), null);
check("access date outside lifetime is skipped", year({ label: "NARA public image, read directly Jul 2026" }), null);
check("iso research date is skipped as a span part", year({ label: "User-provided Discord note, 2026-07-20: lineage" }), null);
check("obituary in death year + 1 kept", year({ label: "Obituary, The Press, 1970" }), 1970);
check("index entry past death year + 1 dropped", year({ label: "Public Records Index entry 1994" }), null);
check("first in-lifetime year wins over access year", year({ label: "1950 U.S. census (read directly Jul 2026)" }), 1950);
check("no birth year means no guess", app.sourceEventYear({ label: "1950 census" }, null, null), null);
check("unknown death allows a generous window", app.sourceEventYear({ label: "1980 yearbook" }, 1930, null), 1980);
check("digits inside memorial ids do not match", year({ label: "Find a Grave memorial 176942740" }), null);

// End-to-end: an undated labeled census lands on the person's timeline.
app.state.data = {
  people: [
    {
      id: "root",
      name: "Toy Example",
      birth: { date: "1900" },
      death: { date: "1969" },
      parents: [], spouses: [], children: [], aliases: [], tags: [], notes: "",
      sources: [
        { label: "1950 U.S. census, Allen County, Kentucky", url: "https://example.com/census" },
        { label: "Ancestry source: U.S., Index to Public Records, 1994-2019", url: "https://example.com/index" },
      ],
    },
  ],
};
const events = app.lifeTimeline(app.state.data.people[0]);
const records = events.filter((event) => event.record);
check("timeline picks up the labeled census", records.length, 1);
check("timeline census year", records[0]?.year, 1950);

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("source-event-year tests passed");
