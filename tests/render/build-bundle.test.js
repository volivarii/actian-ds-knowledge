"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var { buildBundle } = require("../../scripts/render/build-bundle.js");

function freshDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bundle-"));
}

test("buildBundle: emits Components + foundations @dsCard files", function () {
  var dir = freshDir();
  buildBundle(dir);
  var btn = fs.readFileSync(path.join(dir, "Components/button.html"), "utf8");
  assert.match(btn.split("\n")[0], /@dsCard group="Components"/);
  var colors = fs.readFileSync(path.join(dir, "Colors/palette.html"), "utf8");
  assert.match(colors.split("\n")[0], /@dsCard group="Colors"/);
});

test("buildBundle: Type and Spacing foundations cards carry their markers", function () {
  var dir = freshDir();
  buildBundle(dir);
  var type = fs.readFileSync(path.join(dir, "Type/type.html"), "utf8");
  assert.match(type.split("\n")[0], /@dsCard group="Type"/);
  var spacing = fs.readFileSync(path.join(dir, "Spacing/spacing.html"), "utf8");
  assert.match(spacing.split("\n")[0], /@dsCard group="Spacing"/);
});

test("buildBundle: every card is self-contained and token-grounded", function () {
  var dir = freshDir();
  var written = buildBundle(dir);
  assert.ok(written.length >= 4, "at least 4 cards written");
  written.forEach(function (rel) {
    var html = fs.readFileSync(path.join(dir, rel), "utf8");
    assert.ok(
      !/\ssrc=|\shref=|@import/.test(html),
      rel + " must be self-contained",
    );
  });
  // The Colors card shows a real resolved brand color, not an unresolved alias.
  var colors = fs.readFileSync(path.join(dir, "Colors/palette.html"), "utf8");
  assert.ok(!/\{[a-z0-9.-]+\}/i.test(colors), "no unresolved {alias} in swatches");
  assert.match(colors, /#0F5FDC/i, "brand primary hex present");
});
