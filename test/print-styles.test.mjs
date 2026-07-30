// Regression guard for the @media print block in styles.css — printing (or
// save-as-PDF) must render the open profile as a clean document: app chrome
// hidden, the details panel unclipped, and Sources visible even while the
// on-screen panel is collapsed.
//
// Usage: node test/print-styles.test.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

let failures = 0;
function assert(condition, label) {
  if (condition) {
    console.log(`ok - ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${label}`);
  }
}

const printStart = css.indexOf("@media print");
assert(printStart !== -1, "styles.css has an @media print block");

// Slice from the block's opening brace to its matching close so the checks
// below can't accidentally pass by matching screen rules.
function mediaBlock(source, from) {
  const open = source.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return "";
}
const block = printStart === -1 ? "" : mediaBlock(css, printStart);
assert(block.length > 0, "print block braces balance");

const rules = block
  .split("}")
  .map((chunk) => {
    const [selector, declarations = ""] = chunk.split("{");
    return { selector: selector.trim(), declarations };
  })
  .filter((entry) => entry.declarations);

function rule(selectorPart, declarationPart, label) {
  assert(
    rules.some((entry) => entry.selector.includes(selectorPart) && entry.declarations.includes(declarationPart)),
    label,
  );
}

rule(".sidebar", "display: none !important", "print hides the sidebar");
rule(".tree-area", "display: none !important", "print hides the tree area");
rule(".profile-actions", "display: none !important", "print hides profile action buttons");
rule(".sources-panel[hidden]", "display: grid !important", "print forces the collapsed Sources panel visible");
rule("body", "overflow: visible", "print unlocks body scrolling so multiple pages render");
rule(".details-shell", "overflow: visible", "print unclips the details scroll container");
rule(".profile-collapsed .details", "opacity: 1", "print restores the details panel even when profile-collapsed");

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("print-styles checks passed");
