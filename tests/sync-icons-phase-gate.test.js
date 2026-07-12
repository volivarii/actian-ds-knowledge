"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var os = require("os");
var path = require("path");
var S = require("../scripts/sync/sync-from-figma.js");

// ---------------------------------------------------------------------------
// The icons-phase gate, tested through the REAL sync entry point.
//
// classifyIcons is unit-tested in changelog-classifier.test.js, but a unit test
// cannot catch the failure that actually matters here: the `before` snapshot is
// read from disk BEFORE the phase rewrites icons.json, and if that read ever
// resolved to the wrong path (or ran after the write) it would silently degrade
// to an empty set. Every icon would then look newly GAINED, the verdict would be
// "additive" forever, and the gate would be dead while every unit test stayed
// green. That is precisely the bug this whole change exists to kill, so it gets
// an end-to-end test against a real temp pluginDir.
// ---------------------------------------------------------------------------

var GLYPH = { viewBox: "0 0 24 24", body: '<path d="M5 5h14v14H5z"/>' };
var SVG_OK = '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z" fill="#000"/></svg>';

function seedPluginDir(priorIcons) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "icons-gate-"));
  var mk = function (p) {
    fs.mkdirSync(path.join(dir, p), { recursive: true });
  };
  mk("components/dist/registries");
  mk("components/dist/icons");
  mk("components/src");

  fs.writeFileSync(
    path.join(dir, "components/dist/registries/dskit.json"),
    JSON.stringify({
      library: "ds",
      fileKey: "FILEKEY",
      components: {
        keep: { category: "Icons", key: "k-keep", nodeId: "1:1" },
        doomed: { category: "Icons", key: "k-doom", nodeId: "1:2" },
      },
    }),
  );
  // No curated overrides: deriveAndWrite reads this file directly and throws if
  // it is absent, so it must exist even when empty.
  fs.writeFileSync(
    path.join(dir, "components/src/icons-svg.json"),
    JSON.stringify({ _schema_version: 1, icons: {} }),
  );
  // The prior derived set: this is the "before" the gate must actually read.
  fs.writeFileSync(
    path.join(dir, "components/dist/icons/icons.json"),
    JSON.stringify({ _schema_version: 1, icons: priorIcons }),
  );
  return dir;
}

var ICON_GROUPS = { _schema_version: 1, Common: ["keep", "doomed"] };

// `doomed` renders nothing and Figma has no record of its node: a ghost.
var REST_DOOMED_IS_GHOST = {
  getImages: function (fileKey, ids) {
    var images = {};
    ids.forEach(function (id) {
      if (id !== "1:2") images[id] = "url://" + id;
    });
    return Promise.resolve({ images: images });
  },
  getNodes: function (fileKey, ids) {
    var nodes = {};
    ids.forEach(function (id) {
      nodes[id] = id === "1:2" ? null : { document: { id: id } };
    });
    return Promise.resolve({ nodes: nodes });
  },
  fetchBinary: function () {
    return Promise.resolve(Buffer.from(SVG_OK, "utf8"));
  },
};

function iconsPhase(pluginDir, rest) {
  return S.run({
    phase: "icons",
    pluginDir: pluginDir,
    outputDir: path.join(pluginDir, "components", "dist", "registries"),
    releaseNotesDir: path.join(pluginDir, "release-notes"),
    artifactsDir: pluginDir,
    iconGroups: ICON_GROUPS,
    rest: rest,
    keys: { ds: "FILEKEY" },
  });
}

test("icons phase: losing a previously-derived icon is BREAKING end-to-end", async function () {
  // Both icons existed before this sync.
  var dir = seedPluginDir({ keep: GLYPH, doomed: GLYPH });

  var res = await iconsPhase(dir, REST_DOOMED_IS_GHOST);

  assert.equal(
    res.category,
    "breaking",
    "an icon that resolved before and resolves to nothing now must block auto-merge",
  );

  var written = JSON.parse(
    fs.readFileSync(path.join(dir, "components/dist/icons/icons.json"), "utf8"),
  );
  assert.deepEqual(
    Object.keys(written.icons),
    ["keep"],
    "the derived set really did lose the icon (so the verdict is not a fluke)",
  );
});

test("icons phase: an icon lost for the FIRST time is not silently additive (the original bug)", async function () {
  // This is the regression guard. If the `before` snapshot ever reads from the
  // wrong path, or runs after the write, `before` collapses to {} and this
  // sync reports "additive" — exactly how 29 icons auto-merged into main.
  var dir = seedPluginDir({ keep: GLYPH, doomed: GLYPH });
  var res = await iconsPhase(dir, REST_DOOMED_IS_GHOST);
  assert.notEqual(
    res.category,
    "additive",
    "a lost icon reported as additive means the before-snapshot is broken and the gate is dead",
  );
});

test("icons phase: no prior icons.json (first ever run) is additive, not a phantom mass loss", async function () {
  var dir = seedPluginDir({ keep: GLYPH, doomed: GLYPH });
  fs.rmSync(path.join(dir, "components/dist/icons/icons.json"));

  var res = await iconsPhase(dir, REST_DOOMED_IS_GHOST);
  assert.equal(
    res.category,
    "additive",
    "with nothing to compare against, a fresh derive must not report every icon as lost",
  );
});

test("icons phase: a corrupt icons.json FAILS the sync rather than silently disabling the gate", async function () {
  var dir = seedPluginDir({ keep: GLYPH, doomed: GLYPH });
  fs.writeFileSync(
    path.join(dir, "components/dist/icons/icons.json"),
    "{ this is not json",
  );

  var res = await iconsPhase(dir, REST_DOOMED_IS_GHOST);
  assert.equal(
    res.category,
    "error",
    "an unparseable before-set must be an error: swallowing it to null would make every icon look new and report additive",
  );
});
