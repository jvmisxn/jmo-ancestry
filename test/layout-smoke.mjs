// Headless smoke test for the tree layout.
//
// Runs the real layout code from src/app.js (no browser) against a family JSON
// file and checks invariants that guard the pain points we keep fixing:
//   - every node gets finite coordinates and each person is placed once
//   - father-side ancestor lanes stay left of the root, mother-side right
//   - link paths never contain NaN
//   - visually overlapping nodes in a row are reported (warning, not failure)
//
// Usage:
//   node test/layout-smoke.mjs                 # uses data/sample-family.json
//   node test/layout-smoke.mjs /path/to.json   # e.g. the private family data

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

const dataPath = process.argv[2]
  || fileURLToPath(new URL("../data/sample-family.json", import.meta.url));
const data = JSON.parse(readFileSync(dataPath, "utf8"));
if (!Array.isArray(data.people) || !data.people.length) {
  console.error(`No people found in ${dataPath}`);
  process.exit(1);
}

app.state.data = data;
const failures = [];
const warnings = [];
let laneChecks = 0;
let revealChecks = 0;
let spouseChecks = 0;

const checkNodes = (nodes, rootId, mode) => {
  const seen = new Set();
  for (const node of nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      failures.push(`${mode} root=${rootId}: non-finite position for ${node.person.id}`);
    }
    if (seen.has(node.person.id)) {
      failures.push(`${mode} root=${rootId}: ${node.person.id} placed twice`);
    }
    seen.add(node.person.id);
  }
  const rows = new Map();
  for (const node of nodes) {
    if (!rows.has(node.y)) rows.set(node.y, []);
    rows.get(node.y).push(node);
  }
  for (const rowNodes of rows.values()) {
    const sorted = [...rowNodes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].x - sorted[i - 1].x < app.NODE.width) {
        warnings.push(`${mode} root=${rootId}: ${sorted[i - 1].person.id} and ${sorted[i].person.id} overlap (dx=${Math.round(sorted[i].x - sorted[i - 1].x)})`);
      }
    }
  }
};

for (const person of data.people) {
  app.state.rootId = person.id;
  app.state.selectedId = person.id;
  const index = app.relationshipIndex();
  const directIds = app.directRelatives(person.id, index);

  // Full-network mode: everyone connected is laid out.
  app.state.collapseCollateral = false;
  app.state.expandedAncestors = new Set();
  checkNodes(app.layoutNodes(app.buildBranch(person.id, index, null), index), person.id, "full");

  // Minimal mode with every ancestor expanded: lane sides must hold.
  app.state.collapseCollateral = true;
  app.state.expandedAncestors = new Set(data.people.map((p) => p.id));
  const visible = app.expandedTreeIds(person.id, index);
  const nodes = app.layoutNodes(app.buildBranch(person.id, index, visible), index);
  checkNodes(nodes, person.id, "minimal");

  const rootNode = nodes.find((node) => node.person.id === person.id);
  const rootParentCount = app.orderedParentIds(person.id, index).length;
  for (const node of nodes) {
    if (!node.ancestorPath?.length || !rootNode) continue;
    const direction = app.ancestorLaneDirection(node.ancestorPath, rootParentCount);
    if (!direction) continue;
    laneChecks += 1;
    if (Math.sign(node.x - rootNode.x) !== direction) {
      failures.push(`minimal root=${person.id}: ${node.person.id} drifted to the wrong lane (dir=${direction}, dx=${Math.round(node.x - rootNode.x)})`);
    }
  }

  for (const link of app.layoutLinks(nodes, index, directIds)) {
    if (link.d.includes("NaN")) {
      failures.push(`minimal root=${person.id}: link with NaN path (${link.kind})`);
    }
    // Spouse links with another card sitting between the couple must arc over
    // the row (curve command) instead of slicing straight through the card.
    if (link.kind === "spouse-link") {
      const pair = link.people.map((id) => nodes.find((node) => node.person.id === id));
      const [a, b] = pair;
      if (a && b && a.y === b.y) {
        const [l, r] = a.x <= b.x ? [a, b] : [b, a];
        const blocked = nodes.some((node) => node !== l && node !== r && node.y === l.y && node.x > l.x && node.x < r.x);
        spouseChecks += 1;
        if (blocked && !link.d.includes("C")) {
          failures.push(`minimal root=${person.id}: spouse link ${link.people.join("+")} runs straight through an intervening card`);
        }
      }
    }
  }

  // Selecting a hidden ancestor must reveal them: from a collapsed minimal
  // tree, revealAncestorPath + expandedTreeIds must end with the target visible.
  const ancestors = [];
  const upQueue = [person.id];
  const upSeen = new Set([person.id]);
  while (upQueue.length) {
    const id = upQueue.shift();
    for (const parentId of index.get(id)?.parents || []) {
      if (upSeen.has(parentId)) continue;
      upSeen.add(parentId);
      ancestors.push(parentId);
      upQueue.push(parentId);
    }
  }
  for (const ancestorId of ancestors) {
    app.state.expandedAncestors = new Set();
    revealChecks += 1;
    const revealed = app.revealAncestorPath(ancestorId);
    const nowVisible = app.expandedTreeIds(person.id, index);
    if (!revealed || !nowVisible.has(ancestorId)) {
      failures.push(`minimal root=${person.id}: revealAncestorPath failed to surface ancestor ${ancestorId}`);
    }
  }
}

console.log(`Checked ${data.people.length} roots (${laneChecks} ancestor lane placements, ${revealChecks} ancestor reveals, ${spouseChecks} spouse links) in ${dataPath}`);
if (warnings.length) {
  console.log(`Warnings (${warnings.length} row overlaps, first 10):`);
  for (const warning of warnings.slice(0, 10)) console.log(`  - ${warning}`);
}
if (failures.length) {
  console.error(`FAILURES (${failures.length}, first 20):`);
  for (const failure of failures.slice(0, 20)) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Layout smoke test passed.");
