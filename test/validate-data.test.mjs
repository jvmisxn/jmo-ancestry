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
globalThis.window = {
  addEventListener() {},
  innerWidth: 1440,
  location: { hash: "" },
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { hash: "" };
globalThis.requestAnimationFrame = (fn) => fn;

const { __test: app } = await import("../src/app.js");

const valid = () => ({
  meta: { defaultPersonId: "root" },
  people: [
    {
      id: "root",
      name: "Root Person",
      parents: ["parent"],
      spouses: [],
      children: [],
      sources: [{ label: "Census", url: "https://example.com/record" }],
      profile: { photos: [{ url: "https://example.com/photo.jpg", caption: "Portrait" }] },
    },
    { id: "parent", name: "Parent Person", parents: [], spouses: [], children: ["root"] },
  ],
});

const rejects = (label, mutate, pattern) => {
  const data = valid();
  mutate(data);
  try {
    app.validateData(data);
    console.error(`FAIL ${label}: accepted invalid data`);
    process.exit(1);
  } catch (error) {
    if (!pattern.test(error.message)) {
      console.error(`FAIL ${label}: ${error.message}`);
      process.exit(1);
    }
  }
};

app.validateData(valid());
rejects("duplicate ids", (data) => { data.people[1].id = "root"; }, /Duplicate person id/);
rejects("bad default id", (data) => { data.meta.defaultPersonId = "missing"; }, /Default person id/);
rejects("non-array parents", (data) => { data.people[0].parents = "parent"; }, /parents must be an array/);
rejects("missing relationship", (data) => { data.people[0].parents = ["missing"]; }, /references missing parents id/);
rejects("bad photo", (data) => { data.people[0].profile.photos = [{ caption: "No URL" }]; }, /photo without a URL/);
rejects("bad source field", (data) => { data.people[0].sources = [{ label: 42, url: "https://example.com" }]; }, /non-string label/);

console.log("validate-data tests passed.");
