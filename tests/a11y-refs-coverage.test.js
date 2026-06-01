"use strict";

// Guard for the per-component a11y_refs coverage work + WCAG 2.2 re-baseline.
// (Coverage assertions are appended in Task 3.)

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"));
}

// WCAG 2.2 re-baseline: 2.5.5 Target Size is AAA in 2.1/2.2; the AA equivalent
// is 2.5.8 Target Size (Minimum). No slug in the index may cite 2.5.5.
test("a11y-index cites no AAA target-size criterion (2.5.5)", () => {
  const indexText = fs.readFileSync(
    path.join(REPO_ROOT, "accessibility/dist/a11y-index.json"),
    "utf8",
  );
  assert.ok(
    !/\b2\.5\.5\b/.test(indexText),
    "2.5.5 (AAA) must be replaced by 2.5.8 (AA) after the WCAG 2.2 re-baseline",
  );
});

test("a11y intro states WCAG 2.2 AA as the target", () => {
  const intro = fs.readFileSync(
    path.join(REPO_ROOT, "accessibility/src/intro.md"),
    "utf8",
  );
  assert.ok(/WCAG 2\.2 AA/.test(intro), "intro must state WCAG 2.2 AA");
  assert.ok(!/WCAG 2\.1 AA/.test(intro), "intro must not still say WCAG 2.1 AA");
});
