"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var M = require("../../components/render/renderer/matrix.js");

var REPO_ROOT = path.resolve(__dirname, "../..");
var FRAG = path.join(REPO_ROOT, "components/render/dist/fragments");
var BASE_CSS = fs.readFileSync(
  path.join(REPO_ROOT, "components/render/renderer/ds-base.css"),
  "utf8",
);

function ruleCount(prefix) {
  var selRe = new RegExp("\\." + prefix + "(?![a-z0-9])(?!-(?!-))");
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var n = 0;
  var m;
  while ((m = re.exec(BASE_CSS)) !== null) if (selRe.test(m[1])) n++;
  return n;
}

function fragmentClasses(slug) {
  var html = fs.readFileSync(path.join(FRAG, slug + ".html"), "utf8");
  var re = /class="([^"]*)"/g;
  var set = new Set();
  var m;
  while ((m = re.exec(html)) !== null) {
    m[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach(function (t) {
        if (/^ds-/.test(t)) set.add(t.split("--")[0].split("__")[0]);
      });
  }
  return set;
}

// Subject presence: a declared owner that matches no rule is a gate that
// verifies nothing while reporting success. See
// feedback_gate_must_assert_its_subject_was_present.
test("every render slug's owned prefixes resolve to at least one ds-base.css rule", function () {
  var dead = [];
  M.RENDER_SLUGS.forEach(function (slug) {
    M.ownedPrefixes(slug).forEach(function (p) {
      if (ruleCount(p) === 0) dead.push(slug + " -> ." + p);
    });
  });
  assert.deepEqual(dead, [], "owned prefixes with zero ds-base.css rules");
});

// Drift detector: the declaration is truth, but a declared owner that the
// fragment never emits means the render was renamed out from under the map.
test("every declared owner is a class the slug's fragment actually emits", function () {
  var absent = [];
  M.RENDER_SLUGS.forEach(function (slug) {
    var emitted = fragmentClasses(slug);
    M.ownedPrefixes(slug).forEach(function (p) {
      if (!emitted.has(p)) absent.push(slug + " -> ." + p);
    });
  });
  assert.deepEqual(absent, [], "declared owners absent from their fragment");
});

test("CSS_OWNERS carries no entry that merely restates ds-<slug>", function () {
  var redundant = Object.keys(M.CSS_OWNERS).filter(function (slug) {
    var o = M.CSS_OWNERS[slug];
    return o.length === 1 && o[0] === "ds-" + slug;
  });
  assert.deepEqual(redundant, [], "entries equal to the ds-<slug> default");
});

test("CSS_OWNERS has no key that is not a render slug", function () {
  var orphans = Object.keys(M.CSS_OWNERS).filter(function (slug) {
    return M.RENDER_SLUGS.indexOf(slug) === -1;
  });
  assert.deepEqual(orphans, [], "CSS_OWNERS keys absent from RENDER_SLUGS");
});

test("ownedPrefixes falls back to ds-<slug> for an unmapped slug", function () {
  assert.deepEqual(M.ownedPrefixes("button"), ["ds-button"]);
  assert.deepEqual(M.ownedPrefixes("tag-stage"), ["ds-tag", "ds-tag-stage"]);
  assert.deepEqual(M.ownedPrefixes("modal"), ["ds-modal"]);
});
