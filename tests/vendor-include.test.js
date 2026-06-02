"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var { computeInclude } = require("../scripts/derive-vendor-include.js");

var ROOT = path.resolve(__dirname, "..");
var manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "paths-manifest.json"), "utf8"));

function emitted() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "vendor-include.json"), "utf8"));
}

test("emitted vendor-include.json matches the derive (no drift)", function () {
  assert.deepEqual(emitted().include, computeInclude(manifest));
});

test("include contains the knowledge domains", function () {
  var inc = emitted().include;
  ["accessibility", "components", "content", "foundations"].forEach(function (d) {
    assert.ok(inc.includes(d), "missing knowledge dir: " + d);
  });
});

test("include contains the contract surface", function () {
  var inc = emitted().include;
  ["paths-manifest.json", "schemas", "llms.txt", "CONSUMING.md", "ARCHITECTURE.md", "vendor-include.json"].forEach(function (f) {
    assert.ok(inc.includes(f), "missing contract entry: " + f);
  });
});

test("include EXCLUDES tooling + contributor docs (by construction)", function () {
  var inc = emitted().include;
  ["editor", "auth-worker", "scripts", "tests", ".github", "node_modules",
   "package.json", "CLAUDE.md", "AGENTS.md", "CONTRIBUTING.md", "AUTHORING.md",
   "GOVERNANCE.md", "README.md", "CODEOWNERS"].forEach(function (x) {
    assert.ok(!inc.includes(x), "tooling/contributor entry leaked into include: " + x);
  });
});
