"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var os = require("node:os");
var fs = require("node:fs");
var path = require("node:path");
var C = require("../../scripts/render/build-contact-sheet.js");

test("buildContactSheet: emits a page covering the derived slugs + their oracles", function () {
  var out = path.join(os.tmpdir(), "contact-" + process.pid + ".html");
  var slugs = C.buildContactSheet(out);
  assert.ok(slugs.indexOf("tag-default") >= 0);
  assert.ok(slugs.indexOf("checkbox") >= 0);
  var html = fs.readFileSync(out, "utf8");
  assert.match(html, /tag-default/);
  assert.match(html, /checkbox/);
  assert.match(html, /data:image\/webp;base64,/); // at least one oracle embedded (checkbox has media)
  fs.unlinkSync(out);
});
