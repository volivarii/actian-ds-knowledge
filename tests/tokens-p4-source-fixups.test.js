// tests/tokens-p4-source-fixups.test.js
// TDD for P4a source-fidelity fixups in foundations/src/tokens.md:
//   Fix 1 — shadow values must be full rgba() matching live tokens/tokens.css
//   Fix 2 — 3 P2-deferred semantic tokens must now be present
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { parseShadows } = require("../scripts/tokens/lib/parse-composites.js");
const { parseSemantics } = require("../scripts/tokens/lib/parse-semantics.js");

const tokensMd = fs.readFileSync(
  path.resolve(__dirname, "../foundations/src/tokens.md"),
  "utf8",
);

// ─── Fix 1: Shadow source-fidelity ────────────────────────────────────────────
// All 5 zen-shadow-* tokens must carry full rgba() strings matching the live
// tokens/tokens.css §Shadows block (not abbreviated hex shorthands).
// lg and xl layers must appear in the same order as the live css.

const EXPECTED_SHADOWS = {
  xs: "0px 1px 3px 1px rgba(0, 0, 15, 0.06), 0px 1px 5px 0px rgba(0, 0, 18, 0.07)",
  sm: "0px 1px 7px 3px rgba(0, 0, 20, 0.08), 0px 1px 3px 1px rgba(0, 0, 31, 0.12)",
  md: "0px 1px 3px 0px rgba(0, 0, 77, 0.3), 0px 4px 8px 3px rgba(0, 0, 38, 0.15)",
  lg: "0px 6px 10px 4px rgba(0, 0, 38, 0.15), 0px 2px 3px 0px rgba(0, 0, 77, 0.3)",
  xl: "0px 8px 12px 6px rgba(0, 0, 38, 0.15), 0px 4px 4px 0px rgba(0, 0, 77, 0.3)",
};

test("parseShadows(real tokensMd): shadow-xs has full rgba value matching live css", () => {
  const rows = parseShadows(tokensMd);
  const row = rows.find((r) => r.name === "xs");
  assert.ok(row, "shadow-xs must be present");
  assert.equal(row.value, EXPECTED_SHADOWS.xs);
});

test("parseShadows(real tokensMd): shadow-sm has full rgba value matching live css", () => {
  const rows = parseShadows(tokensMd);
  const row = rows.find((r) => r.name === "sm");
  assert.ok(row, "shadow-sm must be present");
  assert.equal(row.value, EXPECTED_SHADOWS.sm);
});

test("parseShadows(real tokensMd): shadow-md has full rgba value matching live css", () => {
  const rows = parseShadows(tokensMd);
  const row = rows.find((r) => r.name === "md");
  assert.ok(row, "shadow-md must be present");
  assert.equal(row.value, EXPECTED_SHADOWS.md);
});

test("parseShadows(real tokensMd): shadow-lg has full rgba value with corrected layer order", () => {
  const rows = parseShadows(tokensMd);
  const row = rows.find((r) => r.name === "lg");
  assert.ok(row, "shadow-lg must be present");
  assert.equal(row.value, EXPECTED_SHADOWS.lg);
});

test("parseShadows(real tokensMd): shadow-xl has full rgba value with corrected layer order", () => {
  const rows = parseShadows(tokensMd);
  const row = rows.find((r) => r.name === "xl");
  assert.ok(row, "shadow-xl must be present");
  assert.equal(row.value, EXPECTED_SHADOWS.xl);
});

test("parseShadows(real tokensMd): no abbreviated hex shorthands remain (no #0F/#12/#14 etc.)", () => {
  const rows = parseShadows(tokensMd);
  for (const row of rows) {
    assert.ok(
      !/#[0-9A-Fa-f]{2}\b/.test(row.value),
      `shadow-${row.name} still contains abbreviated hex: ${row.value}`,
    );
  }
});

// ─── Fix 2: P2-deferred semantic tokens ───────────────────────────────────────
// These 3 tokens exist in the live tokens.css but were not authored in the md.
// They must now be present so a css emit won't drop them.

test("parseSemantics(real tokensMd): text.link.reverse exists and resolves to white", () => {
  const rows = parseSemantics(tokensMd);
  const row = rows.find((r) => r.group === "text" && r.name === "link.reverse");
  assert.ok(
    row,
    "text.link.reverse must be present in tokens.md §2.2 Text Color table",
  );
  assert.equal(
    row.resolvesTo,
    "white",
    "text.link.reverse must resolve to --zen-color-white (live css: #ffffff in all themes)",
  );
});

test("parseSemantics(real tokensMd): text.link.visited exists and resolves to primary-700", () => {
  const rows = parseSemantics(tokensMd);
  const row = rows.find(
    (r) => r.group === "text" && r.name === "link.visited",
  );
  assert.ok(
    row,
    "text.link.visited must be present in tokens.md §2.2 Text Color table",
  );
  assert.equal(
    row.resolvesTo,
    "primary-700",
    "text.link.visited must resolve to --zen-color-primary-700 " +
      "(actian=#0047bc, studio=#00699f, explorer=#007e7b — all match primary-700)",
  );
});

test("parseSemantics(real tokensMd): bg.emphasis exists and resolves to primary-500", () => {
  const rows = parseSemantics(tokensMd);
  const row = rows.find((r) => r.group === "bg" && r.name === "emphasis");
  assert.ok(
    row,
    "bg.emphasis must be present in tokens.md §2.8 Backgrounds table",
  );
  assert.equal(
    row.resolvesTo,
    "primary-500",
    "bg.emphasis must resolve to --zen-color-primary-500 " +
      "(actian=#0f5fdc, studio=#0283be, explorer=#049b98 — all match primary-500)",
  );
});
