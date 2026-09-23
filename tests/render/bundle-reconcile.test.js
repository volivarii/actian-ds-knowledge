"use strict";
// bundle-reconcile.test.js — the three-way diff between what the substrate can
// produce, what is live in a Claude Design project, and what this repository
// has declared it cannot produce.
//
// The drift this catches is the one that actually happened: the dogfood carried
// ten cards the exporter does not emit, for a week, and nothing said so. A live
// card that is neither produced nor declared is the failure; everything else is
// reportable but fine.

var test = require("node:test");
var assert = require("node:assert/strict");

var R = require("../../scripts/render/bundle-reconcile.js");

var EXTERNAL = [
  {
    slug: "card-for-items",
    path: "Data Display/card-for-items.html",
    status: "author",
  },
  { slug: "rich-text", path: "Form/rich-text.html", status: "retire" },
];

test("a live card that is produced is neither missing nor extra", function () {
  var r = R.reconcile({
    produced: ["Action/button.html"],
    live: ["Action/button.html"],
    external: [],
  });
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extraDeclared, []);
  assert.deepEqual(r.extraUndeclared, []);
  assert.equal(r.ok, true);
});

test("a produced card that is not live is reported as missing, and that is not a failure", function () {
  var r = R.reconcile({
    produced: ["Action/button.html", "Form/label.html"],
    live: ["Action/button.html"],
    external: [],
  });
  assert.deepEqual(r.missing, ["Form/label.html"]);
  assert.equal(r.ok, true, "a card waiting to be pushed is not drift");
});

test("a live card that is declared external is reported, and that is not a failure", function () {
  var r = R.reconcile({
    produced: ["Action/button.html"],
    live: ["Action/button.html", "Data Display/card-for-items.html"],
    external: EXTERNAL,
  });
  assert.deepEqual(
    r.extraDeclared.map(function (e) {
      return e.path;
    }),
    ["Data Display/card-for-items.html"],
  );
  assert.deepEqual(r.extraUndeclared, []);
  assert.equal(r.ok, true);
});

test("a live card that is neither produced nor declared FAILS", function () {
  var r = R.reconcile({
    produced: ["Action/button.html"],
    live: ["Action/button.html", "Data Display/tag-stage.html"],
    external: EXTERNAL,
  });
  assert.deepEqual(r.extraUndeclared, ["Data Display/tag-stage.html"]);
  assert.equal(
    r.ok,
    false,
    "undeclared drift is the whole point of this check",
  );
});

test("the declaration is matched by path, not by slug substring", function () {
  // "rich-text" is a prefix of "rich-text-froala". Matching on the slug as a
  // substring would let a produced-but-renamed card hide behind a retirement.
  var r = R.reconcile({
    produced: [],
    live: ["Form/rich-text-froala.html"],
    external: EXTERNAL,
  });
  assert.deepEqual(
    r.extraUndeclared,
    ["Form/rich-text-froala.html"],
    "rich-text's entry must not absorb rich-text-froala",
  );
  assert.equal(r.ok, false);
});

test("non-card files in the live listing are ignored", function () {
  var r = R.reconcile({
    produced: ["Action/button.html"],
    live: [
      "Action/button.html",
      "Action/button.prompt.md",
      "_ds_manifest.json",
      "templates/contact-form/ContactForm.dc.html",
      "thumbnail.html",
      "Data Display",
    ],
    external: [],
  });
  assert.deepEqual(
    r.extraUndeclared,
    [],
    "notes, manifests and templates are not cards",
  );
  assert.equal(r.ok, true);
});
