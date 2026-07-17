"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var os = require("node:os");
var fs = require("node:fs");
var path = require("node:path");
var C = require("../../scripts/render/build-contact-sheet.js");

test("buildContactSheet: emits a page covering the four improved slugs + their oracles", function () {
  var out = path.join(os.tmpdir(), "contact-" + process.pid + ".html");
  var slugs = C.buildContactSheet(out);
  ["tag-default", "checkbox", "radio-button", "toggle"].forEach(function (s) {
    assert.ok(slugs.indexOf(s) >= 0, s + " is in the sign-off sheet");
  });
  var html = fs.readFileSync(out, "utf8");
  assert.match(html, /tag-default/);
  assert.match(html, /radio-button/);
  assert.match(html, /data:image\/webp;base64,/); // at least one oracle embedded
  fs.unlinkSync(out);
});

test("oracleImg: returns null (does not throw) for a slug with no media", function () {
  assert.equal(C.oracleImg("definitely-missing-slug-xyz", "preview"), null);
});
