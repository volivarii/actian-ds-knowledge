"use strict";

// Wave-2 canonical emit: the sync must be able to tell "re-emitted" from
// "changed". Three invariants:
//   A. dist maps are emitted in sorted key order regardless of Figma API
//      iteration order (kills the ~97% move-noise in breaking-PR diffs);
//   B. a second run over identical Figma data is a TRUE no-op: every dist
//      byte identical, no version bump;
//   C. an on-disk file whose entries are current but whose key order is not
//      canonical gets migrated (rewritten sorted, lastSynced preserved) and
//      that content change triggers the bump (TAG-GAP rule: any vendorable
//      content change must reach a tag).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const sync = require(
  path.join(__dirname, "..", "scripts", "sync", "sync-from-figma.js"),
);

// dsKit returns two standalones in REVERSE alphabetical order; other kits
// empty. containing_frame {} → uncategorized (categories artifact still
// emitted, with an empty categories map).
function makeFakeRest() {
  return {
    getComponentSets: async function () {
      return { meta: { component_sets: [] } };
    },
    getComponents: async function (fileKey) {
      if (fileKey === "DS_KEY") {
        return {
          meta: {
            components: [
              {
                key: "k-zeta",
                name: "ZetaWidget",
                node_id: "9:1",
                description: "",
                containing_frame: {},
              },
              {
                key: "k-alpha",
                name: "AlphaWidget",
                node_id: "9:2",
                description: "",
                containing_frame: {},
              },
            ],
          },
        };
      }
      return { meta: { components: [] } };
    },
    getNodes: async function () {
      return { nodes: {} };
    },
    getFile: async function () {
      return { document: { children: [] } };
    },
    getStyles: async function () {
      return { meta: { styles: [] } };
    },
  };
}

function setupDirs() {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "canon-emit-"));
  const pkgPath = path.join(tmpdir, "package.json");
  fs.writeFileSync(
    pkgPath,
    JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2) + "\n",
    "utf8",
  );
  return {
    tmpdir: tmpdir,
    pkgPath: pkgPath,
    opts: {
      keys: { dsKit: "DS_KEY", fmKit: "FM_KEY", metaKit: "META_KEY" },
      outputDir: path.join(tmpdir, "components", "dist", "registries"),
      releaseNotesDir: path.join(tmpdir, "release-notes"),
      artifactsDir: path.join(tmpdir, "tmp-artifacts"),
      pluginJsonPath: pkgPath,
      phase: "registries",
    },
  };
}

function distSnapshot(tmpdir) {
  const roots = [path.join(tmpdir, "components", "dist")];
  const snap = {};
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else snap[p] = fs.readFileSync(p, "utf8");
    });
  }
  roots.forEach(walk);
  return snap;
}

test("A: registry components are emitted in sorted slug order", async () => {
  const s = setupDirs();
  try {
    await sync.run(Object.assign({ rest: makeFakeRest() }, s.opts));
    const reg = JSON.parse(
      fs.readFileSync(path.join(s.opts.outputDir, "dskit.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(reg.components), [
      "alphawidget",
      "zetawidget",
    ]);
  } finally {
    fs.rmSync(s.tmpdir, { recursive: true, force: true });
  }
});

test("B: a second identical run is a true no-op (bytes identical, no second bump)", async () => {
  const s = setupDirs();
  try {
    const r1 = await sync.run(Object.assign({ rest: makeFakeRest() }, s.opts));
    assert.equal(r1.category, "additive"); // first run creates files
    const v1 = JSON.parse(fs.readFileSync(s.pkgPath, "utf8")).version;
    const snap1 = distSnapshot(s.tmpdir);
    assert.ok(Object.keys(snap1).length >= 3, "dist files exist after run 1");

    const r2 = await sync.run(Object.assign({ rest: makeFakeRest() }, s.opts));
    assert.equal(r2.category, "unchanged");
    const v2 = JSON.parse(fs.readFileSync(s.pkgPath, "utf8")).version;
    assert.equal(v2, v1, "no version bump on a no-op night");
    const snap2 = distSnapshot(s.tmpdir);
    assert.deepEqual(
      Object.keys(snap2).sort(),
      Object.keys(snap1).sort(),
      "same file set",
    );
    Object.keys(snap1).forEach(function (p) {
      assert.equal(snap2[p], snap1[p], "byte-identical after no-op run: " + p);
    });
  } finally {
    fs.rmSync(s.tmpdir, { recursive: true, force: true });
  }
});

test("C: non-canonical on-disk key order is migrated (sorted, lastSynced preserved) and bumps", async () => {
  const s = setupDirs();
  try {
    await sync.run(Object.assign({ rest: makeFakeRest() }, s.opts));
    const regPath = path.join(s.opts.outputDir, "dskit.json");
    const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
    const vAfterRun1 = JSON.parse(fs.readFileSync(s.pkgPath, "utf8")).version;

    // Scramble: same entries, reversed key order (simulates the pre-wave-2
    // Figma-iteration-order files on main).
    const scrambled = Object.assign({}, reg, { components: {} });
    Object.keys(reg.components)
      .reverse()
      .forEach(function (slug) {
        scrambled.components[slug] = reg.components[slug];
      });
    fs.writeFileSync(
      regPath,
      JSON.stringify(scrambled, null, 2) + "\n",
      "utf8",
    );

    const r2 = await sync.run(Object.assign({ rest: makeFakeRest() }, s.opts));
    // Entries unchanged → verdict stays unchanged (no false "breaking")…
    assert.equal(r2.category, "unchanged");
    // …but the file is migrated to canonical order,
    const regAfter = JSON.parse(fs.readFileSync(regPath, "utf8"));
    assert.deepEqual(Object.keys(regAfter.components), [
      "alphawidget",
      "zetawidget",
    ]);
    // with lastSynced PRESERVED (no timestamp churn on an entry-equal write),
    assert.equal(regAfter.lastSynced, reg.lastSynced);
    // and the content change reaches a version bump (TAG-GAP rule).
    const vAfterRun2 = JSON.parse(fs.readFileSync(s.pkgPath, "utf8")).version;
    assert.notEqual(
      vAfterRun2,
      vAfterRun1,
      "a byte-level dist change must bump even when entries are unchanged",
    );
  } finally {
    fs.rmSync(s.tmpdir, { recursive: true, force: true });
  }
});
