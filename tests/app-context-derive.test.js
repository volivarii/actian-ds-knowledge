"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const {
  deriveToObject,
  assembleAppRecord,
  deriveSectionsAndRecipes,
} = require("../scripts/app-context/derive-app-context");
const { parseBodySections } = require("../scripts/app-context/lib");

const ROOT = path.resolve(__dirname, "..");
const srcDir = path.join(ROOT, "app-context", "src");

test("derive(src) deep-equals the committed dist (round-trip drift gate)", () => {
  // PR #273 convention: committed dist is the snapshot; re-derive must reproduce it.
  // Covers apps/entities/terminology/patterns only (deriveToObject's own
  // shape): it does NOT reach app-context/dist/recipes or dist/sections, which
  // writeRecipes/writeSections write separately, only from the CLI path
  // (scripts/app-context/derive-app-context.js runCli). See the next test for
  // those two collections.
  const derived = deriveToObject(srcDir);
  const committed = require("../app-context/dist/app-context.json");
  assert.deepEqual(derived, committed);
});

function jsonFilesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

test("derive(src) sections and recipes deep-equal the committed dist (round-trip drift gate)", () => {
  // The one guard for app-context/dist/sections and dist/recipes that runs
  // locally, not only in CI (.github/workflows/validate-manifest.yml has its
  // own drift step, but that is CI-only). Re-runs the real derive
  // (readSections/checkSectionReferences/readRecipes/inlineSections/
  // checkReferences/writeSections/writeRecipes, via the same
  // deriveSectionsAndRecipes runCli itself calls) into a throwaway directory
  // under os.tmpdir(), never into the repo, then deep-equals each written
  // file, and the file SET, against what is committed. A stale or hand-edited
  // committed dist leaf, or one derived by different code than the CLI now
  // runs, fails here.
  const dist = deriveToObject(srcDir);
  const tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), "app-context-dist-"));
  try {
    const result = deriveSectionsAndRecipes(ROOT, srcDir, tmpDist, dist);
    assert.deepEqual(
      result.errors,
      [],
      "a fresh derive must succeed cleanly before it can be compared",
    );

    const collections = [
      {
        name: "sections",
        committedDir: path.join(ROOT, "app-context", "dist", "sections"),
        freshDir: path.join(tmpDist, "sections"),
      },
      {
        name: "recipes",
        committedDir: path.join(ROOT, "app-context", "dist", "recipes"),
        freshDir: path.join(tmpDist, "recipes"),
      },
    ];
    for (const { name, committedDir, freshDir } of collections) {
      const committedFiles = jsonFilesIn(committedDir);
      const freshFiles = jsonFilesIn(freshDir);
      assert.deepEqual(
        freshFiles,
        committedFiles,
        `the set of dist/${name}/*.json files must match a fresh derive from src`,
      );
      for (const f of committedFiles) {
        const committed = JSON.parse(
          fs.readFileSync(path.join(committedDir, f), "utf8"),
        );
        const fresh = JSON.parse(
          fs.readFileSync(path.join(freshDir, f), "utf8"),
        );
        assert.deepEqual(
          fresh,
          committed,
          `dist/${name}/${f} does not match a fresh derive from src; run npm run derive:app-context`,
        );
      }
    }
  } finally {
    fs.rmSync(tmpDist, { recursive: true, force: true });
  }
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
  // Joined to the schema that governs the artifact rather than restated here,
  // so a bump is made in one place and this test cannot disagree with it.
  const pinned = JSON.parse(
    require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "schemas", "app-context.json"),
      "utf8",
    ),
  ).properties._schema_version.const;
  assert.equal(derived._schema_version, pinned);
  assert.equal(derived._meta.auto_generated, true);
  assert.equal(typeof derived._meta.do_not_edit, "string");
});
