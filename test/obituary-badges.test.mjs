// Unit test for the obituary badge helpers: every valid obituary entry
// survives profileObituaries (not just the first), obituarySubject reads the
// deceased's name out of "NAME obituary, Publication" titles, and
// obituarySubjectIsPerson tells a person's own notice apart from a relative's
// obituary that merely mentions them.
//
// Usage: node test/obituary-badges.test.mjs

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

// profileObituaries keeps every valid entry, in order, and drops empty ones.
const person = {
  name: "Toy Edward Graves",
  profile: {
    obituaries: [
      { title: "Toy E. Graves Find a Grave memorial lead", publication: "Find a Grave", url: "https://example.com/toy" },
      { title: "Reathel Graves (Calvert) Lovelace obituary, Goad Funeral Home", publication: "Goad Funeral Home", url: "https://example.com/reathel" },
      {},
      { title: "Danny Graves obituary, Bowling Green Daily News", publication: "Bowling Green Daily News", url: "https://example.com/danny" },
    ],
  },
};
const obits = app.profileObituaries(person);
check("all valid obituaries kept", obits.length, 3);
check("order preserved", obits[2].publication, "Bowling Green Daily News");
check("no obituaries -> empty list", app.profileObituaries({ name: "X" }).length, 0);

// obituarySubject pulls the deceased's name from standard titles.
check(
  "subject from title",
  app.obituarySubject("Danny Graves obituary, Bowling Green Daily News"),
  "Danny Graves",
);
check(
  "subject keeps maiden-name parens",
  app.obituarySubject("Reathel Graves (Calvert) Lovelace obituary, Goad Funeral Home"),
  "Reathel Graves (Calvert) Lovelace",
);
check("memorial lead has no subject", app.obituarySubject("Toy E. Graves Find a Grave memorial lead"), "");
check("empty title has no subject", app.obituarySubject(""), "");

// obituarySubjectIsPerson: first + last tokens match, middle names/initials
// and parenthesized maiden names ignored.
check("own obituary matches", app.obituarySubjectIsPerson("Toy E. Graves", "Toy Edward Graves"), true);
check("maiden name ignored", app.obituarySubjectIsPerson("Paula Jean (Edwards) Graves", "Paula Jean Graves"), true);
check("relative is not the person", app.obituarySubjectIsPerson("Danny Graves", "Toy Edward Graves"), false);
check("son sharing surname is not the person", app.obituarySubjectIsPerson("Jason Matthew Graves", "Matthew Graves"), false);
check("empty subject never matches", app.obituarySubjectIsPerson("", "Toy Edward Graves"), false);

if (failures) {
  console.error(`obituary-badges.test.mjs: ${failures} failure(s)`);
  process.exit(1);
}
console.log("obituary-badges.test.mjs: all checks passed");
