// Unit test for lifeTimeline — the chronological profile timeline that mixes
// birth, children's births, dated source records, and death. Guards ordering
// (year, then birth < children < death < records for same-year ties) and that
// non-ISO research dates ("abt 1850") still land in the right year.
//
// Usage: node test/timeline.test.mjs

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

app.state.data = {
  people: [
    {
      id: "root",
      name: "Ada Example",
      birth: { date: "1880-03-04", place: "Springfield" },
      death: { date: "1950-06-01", place: "Shelbyville" },
      parents: ["p-mother", "p-father"], spouses: ["spouse"], children: ["kid-a", "kid-b", "kid-undated"],
      aliases: [], tags: [], notes: "",
      sources: [
        { label: "1900 United States Census", date: "1900", url: "https://example.com/census-1900" },
        { label: "Obituary", date: "1950-06-03", publication: "The Gazette" },
        { label: "Undated portrait" },
        { label: "Find a Grave memorial", date: "1975", repository: "Find a Grave" },
      ],
    },
    { id: "spouse", name: "Spouse Example", birth: null, death: { date: "1940-02-10" }, parents: [], spouses: ["root"], children: ["kid-a", "kid-b", "kid-undated"], aliases: [], tags: [], notes: "", sources: [] },
    { id: "p-mother", name: "Mother Example", birth: null, death: { date: "1912-05-01" }, parents: [], spouses: [], children: ["root"], aliases: [], tags: [], notes: "", sources: [] },
    { id: "p-father", name: "Father Example", birth: null, death: { date: "1875" }, parents: [], spouses: [], children: ["root"], aliases: [], tags: [], notes: "", sources: [] },
    { id: "kid-a", name: "Ada Junior", birth: { date: "abt 1905" }, death: { date: "1932-01-15" }, parents: ["root", "spouse"], spouses: [], children: [], aliases: [], tags: [], notes: "", sources: [] },
    { id: "kid-b", name: "Ben Example", birth: { date: "1908-11-20", place: "Springfield" }, death: { date: "1980" }, parents: ["root", "spouse"], spouses: [], children: [], aliases: [], tags: [], notes: "", sources: [] },
    { id: "kid-undated", name: "No Dates", birth: null, death: null, parents: ["root", "spouse"], spouses: [], children: [], aliases: [], tags: [], notes: "", sources: [] },
  ],
};

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok ${label}`);
  }
};

const root = app.state.data.people[0];
const events = app.lifeTimeline(root);

check("event order (year + label)", events.map((e) => `${e.year} ${e.label}`), [
  "1880 Born",
  "1900 1900 United States Census",
  "1904 Married Spouse Example",
  "1905 Ada Junior born",
  "1908 Ben Example born",
  "1912 Mother Example died",
  "1932 Ada Junior died",
  "1940 Spouse Example died",
  "1950 Died",
  "1950 Obituary",
  "1975 Find a Grave memorial",
]);
check("marriage event links to spouse", events.find((e) => e.marriage)?.personId, "spouse");
check("marriage event carries age and estimated flag", events.find((e) => e.marriage)?.detail, "about age 24 · year estimated");
check("posthumous record carries no age", events.find((e) => e.label === "Find a Grave memorial")?.detail, "Find a Grave");
check("undated child and undated source excluded", events.some((e) => /No Dates|portrait/.test(e.label)), false);
check("parent death before person's birth excluded", events.some((e) => e.label === "Father Example died"), false);
check("parent-loss event carries role + age", events.find((e) => e.label === "Mother Example died")?.detail, "parent · at age 32");
check("spouse-loss event links to the spouse", events.find((e) => e.label === "Spouse Example died")?.personId, "spouse");
check("child-loss event carries child age + parent age", events.find((e) => e.label === "Ada Junior died")?.detail, "child · aged 27 · at age 52");
check("child death after person's own death excluded", events.some((e) => e.label === "Ben Example died"), false);
check("record keeps its link", events.find((e) => e.record)?.url, "https://example.com/census-1900");
check("in-lifetime record carries person's age", events.find((e) => e.label === "1900 United States Census")?.detail, "around age 20");
check("record age joins existing meta", events.find((e) => e.label === "Obituary")?.detail, "around age 70 · The Gazette");
check("child event carries parent age + place", events.find((e) => e.label === "Ben Example born")?.detail, "aged 28 · Springfield");
check("death detail includes age", /aged 70/.test(events.find((e) => e.label === "Died")?.detail || ""), true);
check("obituary sorts after death in same year", events.findIndex((e) => e.label === "Obituary") > events.findIndex((e) => e.label === "Died"), true);

// A person with only birth/death produces no timeline extras (renderTimeline
// hides the section in that case).
const bare = { id: "bare", name: "Bare", birth: { date: "1900" }, death: { date: "1960" }, parents: [], spouses: [], children: [], sources: [] };
app.state.data.people.push(bare);
const bareEvents = app.lifeTimeline(bare);
check("bare person has no child/record events", bareEvents.filter((e) => e.rank === 1 || e.record).length, 0);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("timeline.test.mjs passed");
