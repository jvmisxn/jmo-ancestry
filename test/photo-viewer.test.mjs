// Smoke test for renderProfilePhoto / the profile photo viewer. Guards that
// profiles with no photo get the initials placeholder, a single photo renders
// with no thumbnail strip, and multi-photo profiles get a thumbnail strip
// where clicking a thumbnail swaps the main image and moves the active state.
//
// Usage: node test/photo-viewer.test.mjs

globalThis.__JMO_HEADLESS_TEST__ = true;

const makeEl = (tag = "div") => ({
  tagName: tag,
  children: [],
  handlers: {},
  attrs: {},
  className: "",
  textContent: "",
  title: "",
  hidden: false,
  style: {},
  value: "",
  classList: { toggle() {}, add() {}, remove() {} },
  append(...nodes) { this.children.push(...nodes); },
  replaceChildren(...nodes) { this.children = [...nodes]; },
  addEventListener(type, handler) { this.handlers[type] = handler; },
  setAttribute(name, value) { this.attrs[name] = String(value); },
  removeAttribute(name) { delete this.attrs[name]; },
  click() { this.handlers.click?.(); },
});

// Memoize per selector so the test can grab the same #detail-photo element
// that app.js captured at import time.
const bySelector = new Map();
const documentHandlers = {};
globalThis.document = {
  querySelector(selector) {
    if (!bySelector.has(selector)) bySelector.set(selector, makeEl());
    return bySelector.get(selector);
  },
  createElement: (tag) => makeEl(tag),
  createElementNS: (namespace, tag) => makeEl(tag),
  addEventListener(type, handler) { documentHandlers[type] = handler; },
  body: { classList: { toggle() {} } },
};
globalThis.window = { addEventListener() {}, innerWidth: 1440, location: { hash: "" } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { hash: "" };
globalThis.requestAnimationFrame = (fn) => fn;

const { __test: app } = await import("../src/app.js");
const photoBox = document.querySelector("#detail-photo");

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}${detail ? `\n  ${detail}` : ""}`);
  } else {
    console.log(`ok ${label}`);
  }
};

// --- No photos: initials placeholder ---
app.renderProfilePhoto({ id: "a", name: "Ada Example" });
check("no photos renders placeholder", photoBox.children[0]?.className === "photo-placeholder");
check("placeholder shows initials", photoBox.children[0]?.textContent === "AE",
  `got ${JSON.stringify(photoBox.children[0]?.textContent)}`);

// --- Single photo: main image, caption, no thumbnail strip ---
app.renderProfilePhoto({
  id: "b",
  name: "Ben Example",
  photos: [{ url: "https://example.com/ben.jpg", caption: "Ben, 1950", credit: "Family album" }],
});
check("single photo renders img", photoBox.children[0]?.tagName === "img"
  && photoBox.children[0]?.src === "https://example.com/ben.jpg");
check("single photo caption joins caption and credit",
  photoBox.children[1]?.textContent === "Ben, 1950 - Family album");
check("single photo has no thumbnail strip",
  !photoBox.children.some((child) => child.className === "photo-thumbs"));

// --- Two photos: thumbnail strip, click swaps the main image ---
const cora = {
  id: "c",
  name: "Cora Example",
  profile: {
    photos: [
      { url: "https://example.com/cora-1.jpg", caption: "Portrait" },
      { url: "https://example.com/cora-2.jpg", caption: "Wedding day" },
    ],
  },
};
app.renderProfilePhoto(cora);
const strip = photoBox.children.find((child) => child.className === "photo-thumbs");
check("two photos render a thumbnail strip", Boolean(strip));
check("strip has one thumb per photo", strip?.children.length === 2);
check("first thumb starts active", strip?.children[0]?.className === "photo-thumb active"
  && strip?.children[0]?.attrs["aria-pressed"] === "true");
check("main image starts on first photo", photoBox.children[0]?.src === "https://example.com/cora-1.jpg");

strip?.children[1]?.click();
const stripAfter = photoBox.children.find((child) => child.className === "photo-thumbs");
check("clicking second thumb swaps main image", photoBox.children[0]?.src === "https://example.com/cora-2.jpg");
check("clicking second thumb updates caption", photoBox.children[1]?.textContent === "Wedding day");
check("active state moves to second thumb", stripAfter?.children[1]?.className === "photo-thumb active"
  && stripAfter?.children[0]?.className === "photo-thumb");

// --- Lightbox: clicking the main image opens full size, arrows cycle, Esc closes ---
const lightboxEl = document.querySelector("#photo-lightbox");
const lightboxImage = document.querySelector("#photo-lightbox-image");
const lightboxCaption = document.querySelector("#photo-lightbox-caption");
lightboxEl.hidden = true;
app.enablePhotoLightbox();

app.renderProfilePhoto(cora);
check("main image is marked openable", photoBox.children[0]?.className === "photo-open"
  && photoBox.children[0]?.attrs.role === "button");
photoBox.children[0]?.click();
check("clicking main image opens the lightbox", lightboxEl.hidden === false);
check("lightbox shows the active photo", lightboxImage.src === "https://example.com/cora-1.jpg");
check("lightbox caption includes position", lightboxCaption.textContent === "Portrait · 1 of 2");

documentHandlers.keydown?.({ key: "ArrowRight", preventDefault() {} });
check("ArrowRight cycles to the next photo", lightboxImage.src === "https://example.com/cora-2.jpg"
  && lightboxCaption.textContent === "Wedding day · 2 of 2");
documentHandlers.keydown?.({ key: "ArrowRight", preventDefault() {} });
check("cycling wraps back to the first photo", lightboxImage.src === "https://example.com/cora-1.jpg");
documentHandlers.keydown?.({ key: "Escape" });
check("Escape closes the lightbox", lightboxEl.hidden === true);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("photo-viewer smoke test passed");
