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
  ["read-only-tag", "checkbox", "radio", "toggle"].forEach(function (s) {
    assert.ok(slugs.indexOf(s) >= 0, s + " is in the sign-off sheet");
  });
  var html = fs.readFileSync(out, "utf8");
  assert.match(html, /read-only-tag/);
  assert.match(html, /\bradio\b/);
  assert.match(html, /data:image\/webp;base64,/); // at least one oracle embedded
  fs.unlinkSync(out);
});

test("oracleImg: returns null (does not throw) for a slug with no media", function () {
  assert.equal(C.oracleImg("definitely-missing-slug-xyz", "preview"), null);
});

test("buildContactSheet: each card actually renders its component, not its group name", function () {
  // The old assertions greped for slug names, which appear in the <h2> headings
  // whatever the cards contain. That let a caller passing the WRONG ARGUMENTS
  // through selfContainedCard stay green while every iframe emitted
  // `group="undefined"` and a body of the literal group name, with the component
  // markup injected inside <style>. A sign-off sheet that renders nothing to sign
  // off on is worse than a red one.
  var out = path.join(os.tmpdir(), "contact-body-" + process.pid + ".html");
  C.buildContactSheet(out);
  var html = fs.readFileSync(out, "utf8");
  fs.unlinkSync(out);

  assert.ok(
    html.indexOf('group=&quot;undefined&quot;') === -1 &&
      html.indexOf('group="undefined"') === -1,
    "no card was built with an undefined group, which means the arguments lined up",
  );
  // The component's own markup must reach the card BODY, past the closing
  // style. srcdoc escapes only double quotes, so the angle brackets are literal.
  assert.match(
    html,
    /<\/style><\/head><body[^>]*><(div|span|button|label|nav|ul)/,
    "each card's body opens with real component markup, not a group name",
  );
});
