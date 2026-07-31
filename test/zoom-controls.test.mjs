// The zoom +/− buttons and keyboard shortcut zoom around the viewport center
// via zoomStep; these checks pin the step ratio, the clamp range shared with
// wheel/pinch zoom, the center anchoring math, and the markup/tips coverage.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
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

let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};

const { state, zoomStep, zoomAt, HELP_TIPS } = app;

const dataPath = fileURLToPath(new URL("../data/sample-family.json", import.meta.url));
state.data = JSON.parse(readFileSync(dataPath, "utf8"));
state.rootId = state.data.people[0].id;

// zoomStep multiplies the scale by 1.2 per step in either direction.
state.scale = 1;
state.offsetX = 0;
state.offsetY = 0;
zoomStep(1);
assert(Math.abs(state.scale - 1.2) < 1e-9, "zoom in steps the scale up by 1.2x");
zoomStep(-1);
assert(Math.abs(state.scale - 1) < 1e-9, "zoom out undoes a zoom in");

// Center anchoring: content at the viewport center stays put across a step.
state.scale = 1;
state.offsetX = 40;
state.offsetY = 20;
const centerX = 400;
const centerY = 300;
const worldX = (centerX - state.offsetX) / state.scale;
const worldY = (centerY - state.offsetY) / state.scale;
zoomStep(1);
assert(
  Math.abs(worldX * state.scale + state.offsetX - centerX) < 1e-6
    && Math.abs(worldY * state.scale + state.offsetY - centerY) < 1e-6,
  "zoomStep keeps the viewport center anchored",
);

// The clamp range matches wheel/pinch zoom: 0.34 to 1.8.
state.scale = 1;
for (let i = 0; i < 20; i += 1) zoomStep(1);
assert(Math.abs(state.scale - 1.8) < 1e-9, "zooming in clamps at 1.8x");
for (let i = 0; i < 40; i += 1) zoomStep(-1);
assert(Math.abs(state.scale - 0.34) < 1e-9, "zooming out clamps at 0.34x");

// zoomAt ignores a no-op scale so render work is skipped at the clamp edge.
state.scale = 1.8;
state.offsetX = 123;
zoomAt(0, 0, 5);
assert(state.offsetX === 123 && state.scale === 1.8, "clamped zoomAt leaves offsets untouched");

// The buttons exist in the markup, inside the tree viewport overlay.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert(html.includes('id="zoom-in"'), "index.html has the zoom-in button");
assert(html.includes('id="zoom-out"'), "index.html has the zoom-out button");
assert(/class="zoom-controls"/.test(html), "zoom buttons sit in the zoom-controls overlay");

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
assert(/\.zoom-controls\s*\{[^}]*position:\s*absolute/.test(css), "zoom controls overlay the viewport");

// The keyboard shortcut is documented in the Tips popover.
const keyboardTips = HELP_TIPS.find((group) => group.area === "Keyboard")?.tips || [];
assert(
  keyboardTips.some((tip) => tip.keys.includes("+")),
  "Tips popover documents the +/− zoom keys",
);

console.log(`zoom-controls: ${checks} checks passed`);
