"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  deriveToObject,
  assembleAppRecord,
  joinPersonas,
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
    "\n## Purpose\n\nGovernance and catalog\n\n## Signals\n\n- steward\n- glossary admin\n";
  const rec = assembleAppRecord(fm, parseBodySections(body));
  // `users` holds its slot empty here; joinPersonas fills it from the personas.
  assert.deepEqual(rec, {
    label: "Studio",
    purpose: "Governance and catalog",
    users: [],
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

// A throwaway src tree, removed even when the body throws.
function withSrc(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "app-context-src-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, text);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function appFile(slug, extraSection = "") {
  return [
    "---",
    "_schema_version: 1",
    `slug: ${slug}`,
    `label: ${slug}`,
    "header:",
    `  type: ${slug}`,
    "sidebar: []",
    "---",
    "",
    "## Purpose",
    "",
    "Governance",
    "",
    extraSection,
    "## Signals",
    "",
    "- govern",
    "",
  ].join("\n");
}

test("an app file that still carries ## Users is refused, naming the file and where the list lives now", () => {
  assert.throws(
    () =>
      withSrc(
        { "apps/studio.md": appFile("studio", "## Users\n\n- Data steward\n") },
        (dir) => deriveToObject(dir),
      ),
    (err) =>
      /apps\/studio\.md/.test(err.message) &&
      /## Users/.test(err.message) &&
      /app-context\/src\/personas/.test(err.message),
  );
});

test("the same app without ## Users derives, so the refusal is about that section alone", () => {
  const out = withSrc({ "apps/studio.md": appFile("studio") }, (dir) =>
    deriveToObject(dir),
  );
  assert.deepEqual(out.apps.studio.users, []);
  assert.deepEqual(out.personas, {});
});

test("joinPersonas: an app's users are the sorted labels of the personas that list it", () => {
  const apps = {
    studio: { users: [], useCases: [] },
    explorer: { users: [], useCases: [] },
  };
  const personas = {
    "data-steward": { label: "Data steward", apps: ["studio"] },
    "data-architect": { label: "Data architect", apps: ["studio"] },
    analyst: { label: "Analyst", apps: ["explorer"] },
    unplaced: { label: "Unplaced", apps: [] },
  };
  joinPersonas(apps, personas);
  assert.deepEqual(apps.studio.users, ["Data architect", "Data steward"]);
  assert.deepEqual(apps.explorer.users, ["Analyst"]);
});

test("joinPersonas: a persona's useCases are the app use cases whose audience names it", () => {
  const apps = {
    studio: {
      users: [],
      useCases: [
        {
          audience: ["Data steward", "Data architect"],
          jobs: ["Govern"],
          patterns: ["asset-detail-360"],
        },
        { audience: ["Data steward", "Data engineer"], jobs: ["Import"] },
      ],
    },
    explorer: {
      users: [],
      useCases: [{ audience: ["Analyst"], jobs: ["Discover"] }],
    },
  };
  const personas = {
    "data-steward": { label: "Data steward", apps: ["studio"] },
    "data-architect": { label: "Data architect", apps: ["studio"] },
    analyst: { label: "Analyst", apps: ["explorer"] },
  };
  joinPersonas(apps, personas);
  assert.deepEqual(personas["data-steward"].useCases, [
    { app: "studio", jobs: ["Govern"], patterns: ["asset-detail-360"] },
    { app: "studio", jobs: ["Import"] },
  ]);
  assert.deepEqual(personas["data-architect"].useCases, [
    { app: "studio", jobs: ["Govern"], patterns: ["asset-detail-360"] },
  ]);
  assert.deepEqual(personas.analyst.useCases, [
    { app: "explorer", jobs: ["Discover"] },
  ]);
  // No patterns on the use case means no patterns key, not an empty list.
  assert.equal("patterns" in personas["data-steward"].useCases[1], false);
});

test("the real derive: users come from personas, and a persona reaches a use case", () => {
  const derived = deriveToObject(srcDir);
  const personas = Object.values(derived.personas);
  assert.ok(personas.length > 0, "no personas derived, so this proves nothing");
  for (const [slug, app] of Object.entries(derived.apps)) {
    assert.ok(app.users.length > 0, `${slug} has no users`);
    for (const label of app.users) {
      const owner = personas.find((p) => p.label === label);
      assert.ok(owner && owner.apps.includes(slug), `${slug}.users "${label}"`);
    }
  }
  assert.ok(
    personas.some((p) => p.useCases.length > 0),
    "no persona reaches a use case",
  );
});
