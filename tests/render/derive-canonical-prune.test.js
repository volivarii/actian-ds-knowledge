"use strict";

// #520 / #572: derive-canonical.js wrote one fragment per rendered slug and
// never deleted one, so a slug that stopped rendering left its fragment
// tracked, shipped and vendored, exactly as a usage note once fossilised
// through a rename (#567). Same shape as pruneNotes there: a wipe guard (an
// empty slug set is a missing input, not a retirement), a ceiling (a partial
// dist is not a mass retirement), and the decision split from the deletion so
// the CLI refuses BEFORE it writes anything.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var D = require("../../scripts/render/derive-canonical.js");

function tmpFragmentsDir(files) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "fragments-"));
  Object.keys(files).forEach(function (f) {
    fs.writeFileSync(path.join(dir, f), files[f]);
  });
  return dir;
}

test("fragmentsToPrune: names a fragment the manifest no longer lists, and nothing else", function () {
  var dir = tmpFragmentsDir({ "radio.html": "kept", "radio-button.html": "fossil", "button.html": "kept" });
  assert.deepEqual(D.fragmentsToPrune(dir, ["radio", "button"]), ["radio-button.html"]);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["button.html", "radio-button.html", "radio.html"], "vetting deletes nothing");
});

test("pruneFragments: deletes what was vetted and reports it by name", function () {
  var dir = tmpFragmentsDir({ "radio.html": "kept", "radio-button.html": "fossil" });
  assert.deepEqual(D.pruneFragments(dir, D.fragmentsToPrune(dir, ["radio"])), ["radio-button.html"]);
  assert.deepEqual(fs.readdirSync(dir), ["radio.html"]);
});

test("fragmentsToPrune: refuses to prune against an empty slug set (the wipe guard)", function () {
  var dir = tmpFragmentsDir({ "radio.html": "kept" });
  assert.throws(function () { D.fragmentsToPrune(dir, []); }, /refusing to prune against an empty slug set/);
  assert.deepEqual(fs.readdirSync(dir), ["radio.html"]);
});

test("fragmentsToPrune: refuses a prune above the ceiling, naming the slugs", function () {
  var files = {};
  for (var i = 0; i < D.PRUNE_CEILING + 1; i++) files["gone-" + i + ".html"] = "fossil";
  files["button.html"] = "kept";
  var dir = tmpFragmentsDir(files);
  assert.throws(function () { D.fragmentsToPrune(dir, ["button"]); }, /refusing to delete 11 fragments/);
  assert.equal(fs.readdirSync(dir).length, D.PRUNE_CEILING + 2, "nothing deleted");
});

test("writeDist prunes a fossil fragment beside the ones it writes, and says so", function () {
  var dist = fs.mkdtempSync(path.join(os.tmpdir(), "render-dist-"));
  fs.mkdirSync(path.join(dist, "fragments"));
  fs.writeFileSync(path.join(dist, "fragments", "no-such-component.html"), "fossil");
  var out = D.writeDist(dist);
  assert.deepEqual(out.pruned, ["no-such-component.html"]);
  assert.ok(!fs.existsSync(path.join(dist, "fragments", "no-such-component.html")), "the fossil is gone");
  assert.ok(fs.existsSync(path.join(dist, "fragments", "button.html")), "the live fragments are written");
  assert.equal(
    fs.readdirSync(path.join(dist, "fragments")).length,
    out.manifest.renders.length,
    "the directory holds exactly what the manifest lists",
  );
});
