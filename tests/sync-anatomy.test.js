// tests/sync-anatomy.test.js
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var { syncAnatomy } = require("../scripts/sync/sync-anatomy");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "anat-"));
}

test("syncAnatomy writes per-slug files + bundle from a fake rest", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      library: "ds",
      fileKey: "F",
      components: { button: { name: "Button", key: "k", nodeId: "1:1" } },
    }),
  );

  var fakeRest = {
    getNodes: function (fileKey, ids) {
      return Promise.resolve({
        nodes: {
          "1:1": {
            document: {
              type: "COMPONENT",
              name: "Button",
              layoutMode: "HORIZONTAL",
              itemSpacing: 8,
              children: [{ type: "TEXT", name: "Label", characters: "Click" }],
            },
          },
        },
      });
    },
    // no getLocalVariables → tokenRefs degrade to []
  };

  var written = await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: function (p, o) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(o));
      },
      syncedAt: "2026-06-11",
    },
    "dsKit",
  );

  assert.equal(written.kind, "anatomy");
  assert.equal(written.count, 1);
  // phase contract: aggregateVerdict/buildChangelog read fileLabel + verdict
  assert.equal(written.fileLabel, "anatomy:dsKit");
  assert.equal(written.verdict.category, "additive");
  var file = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "button.json"), "utf8"),
  );
  assert.equal(file._schema_version, 1);
  assert.equal(file.slug, "button");
  assert.equal(file.kit, "dskit");
  assert.equal(file.root.layout.axis, "row");
  var bundle = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "..", "anatomy.bundle.json"), "utf8"),
  );
  // bundle is enveloped under `components` (not a bare slug map)
  assert.ok(bundle.components.button);
  assert.equal(bundle._schema_version, 1);
});

test("syncAnatomy resolves token refs when getLocalVariables is available", async function () {
  var dir = tmpDir();
  var registriesDir = path.join(dir, "registries");
  var anatomyDir = path.join(dir, "anatomy");
  fs.mkdirSync(registriesDir, { recursive: true });
  fs.writeFileSync(
    path.join(registriesDir, "dskit.json"),
    JSON.stringify({
      components: { button: { nodeId: "1:1" } },
    }),
  );
  var fakeRest = {
    getNodes: function () {
      return Promise.resolve({
        nodes: {
          "1:1": {
            document: {
              type: "COMPONENT",
              name: "Button",
              layoutMode: "HORIZONTAL",
              boundVariables: { itemSpacing: { id: "V1" } },
              itemSpacing: 8,
              children: [],
            },
          },
        },
      });
    },
    getLocalVariables: function () {
      return Promise.resolve({
        meta: { variables: { V1: { name: "spacing/100" } } },
      });
    },
  };
  var written = await syncAnatomy(
    {
      rest: fakeRest,
      registriesDir: registriesDir,
      anatomyDir: anatomyDir,
      keys: { dsKit: "F" },
      writeJson: function (p, o) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(o));
      },
      syncedAt: "2026-06-11",
    },
    "dsKit",
  );
  assert.equal(written.count, 1);
  var file = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, "button.json"), "utf8"),
  );
  assert.equal(file.root.layout.gap, "--spacing-100");
});
