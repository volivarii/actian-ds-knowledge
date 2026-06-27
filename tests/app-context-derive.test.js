"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  deriveToObject,
  assembleAppRecord,
} = require("../scripts/app-context/derive-app-context");
const { parseBodySections } = require("../scripts/app-context/lib");

const ROOT = path.resolve(__dirname, "..");
const srcDir = path.join(ROOT, "app-context", "src");

test("derive(src) deep-equals the committed dist (round-trip drift gate)", () => {
  // PR #273 convention: committed dist is the snapshot; re-derive must reproduce it.
  const derived = deriveToObject(srcDir);
  const committed = require("../app-context/dist/app-context.json");
  assert.deepEqual(derived, committed);
});

test("assembleAppRecord maps sections to fields in canonical key order", () => {
  const fm = {
    label: "Studio",
    header: { type: "Studio" },
    sidebar: [{ label: "Dashboard", id: "dashboard" }],
  };
  const body =
    "\n## Purpose\n\nGovernance and catalog\n\n## Users\n\n- Data steward\n- Data engineer\n\n## Signals\n\n- steward\n- glossary admin\n";
  const rec = assembleAppRecord(fm, parseBodySections(body));
  assert.deepEqual(rec, {
    label: "Studio",
    purpose: "Governance and catalog",
    users: ["Data steward", "Data engineer"],
    header: { type: "Studio" },
    sidebar: [{ label: "Dashboard", id: "dashboard" }],
    signals: ["steward", "glossary admin"],
    useCases: [],
  });
  // Key order must be exactly label, purpose, users, header, sidebar, signals, useCases.
  assert.deepEqual(Object.keys(rec), [
    "label",
    "purpose",
    "users",
    "header",
    "sidebar",
    "signals",
    "useCases",
  ]);
});

test("assembleAppRecord carries useCases and appends them after signals", () => {
  const fm = {
    label: "Studio",
    header: { type: "Studio" },
    sidebar: [],
    useCases: [
      {
        audience: ["Data steward"],
        jobs: ["Govern the catalog"],
        patterns: ["asset-detail-360"],
      },
    ],
  };
  const rec = assembleAppRecord(fm, []);
  assert.deepEqual(rec.useCases, fm.useCases);
  assert.deepEqual(Object.keys(rec), [
    "label",
    "purpose",
    "users",
    "header",
    "sidebar",
    "signals",
    "useCases",
  ]);
});

test("assembleAppRecord defaults useCases to [] when absent", () => {
  const rec = assembleAppRecord(
    { label: "X", header: { type: "X" }, sidebar: [] },
    [],
  );
  assert.deepEqual(rec.useCases, []);
});

test("derive(src) carries expected _meta shape", () => {
  const derived = deriveToObject(srcDir);
  assert.equal(derived._schema_version, 1);
  assert.equal(derived._meta.auto_generated, true);
  assert.equal(typeof derived._meta.do_not_edit, "string");
});
