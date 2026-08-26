"use strict";

// A fold is a removal that went somewhere.
//
// The DS Kit reorg retired six components by folding their artwork into a
// variant axis of a surviving one (`confirmation`, `error-state` and
// `maintenance-state` into `empty-state`'s `Empty=` axis; `digram-topic` into
// `digram-item-types`; the two lineage nodes into `lineage-individual-node`).
// Nothing was lost, and the sync reported "Removed (7)", which reads as
// artwork deleted and cost a round-trip through Figma to disprove.
//
// A fold is DECLARED, never inferred: the variant values do not reliably carry
// the old slug (`Maintenance` is not `maintenance-state`, `Topic 1` is not
// `digram-topic`), so guessing would be worse than saying nothing.
//
// A declared fold is reported as a fold and STILL BREAKS THE NIGHT. It is not
// absorbed, for the reason `rename-preconditions.js` exists: the identity
// ledger makes resolution survive, but it cannot make authored references
// correct, and all six are still named in the renderer, the app-context
// patterns and the category defaults. An additive verdict there would open an
// auto-merge PR whose checks can never go green, which is strictly worse than
// the breaking path it replaced.

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var classify = require(
  path.join(__dirname, "..", "scripts", "changelog", "changelog-classifier.js"),
);

function reg(components) {
  return { components: components };
}

var BEFORE = reg({
  confirmation: { key: "K1", name: "Confirmation" },
  "empty-state": { key: "K9", name: "Empty state" },
});
var AFTER = reg({ "empty-state": { key: "K9", name: "Empty state" } });

test("fold: a declared fold is reported as a fold, not a removal", function () {
  var d = classify._diffRegistry(BEFORE, AFTER, {
    confirmation: "empty-state",
  });

  assert.deepEqual(d.removed, [], "not a removal");
  assert.deepEqual(
    d.folded.map(function (f) {
      return f.slug + " -> " + f.into;
    }),
    ["confirmation -> empty-state"],
  );
});

test("fold: a fold still breaks the night, naming its destination", function () {
  var r = classify({
    fileKind: "registry",
    before: BEFORE,
    after: AFTER,
    foldedInto: { confirmation: "empty-state" },
  });

  assert.equal(r.category, "breaking", "a fold is a decision a human must see");
  assert.equal(r.reasons.length, 1);
  assert.match(r.reasons[0], /folded/i);
  assert.match(r.reasons[0], /empty-state/);
});

test("fold: the changelog names where the artwork went", function () {
  var r = classify({
    fileKind: "registry",
    before: BEFORE,
    after: AFTER,
    foldedInto: { confirmation: "empty-state" },
  });

  assert.match(r.changelog, /Folded/);
  assert.match(r.changelog, /empty-state/);
});

test("fold: a declaration pointing at a component that is NOT in the new registry is ignored", function () {
  // THE FALSE ALL-CLEAR: dead or mistyped config must not launder a real
  // removal into a fold. If the destination is not there, nothing was folded.
  var d = classify._diffRegistry(BEFORE, AFTER, { confirmation: "nowhere" });

  assert.deepEqual(
    d.removed.map(function (x) {
      return x.slug;
    }),
    ["confirmation"],
  );
  assert.deepEqual(d.folded, []);
});

test("fold: an undeclared removal is still a plain removal", function () {
  var d = classify._diffRegistry(BEFORE, AFTER, {});
  assert.deepEqual(
    d.removed.map(function (x) {
      return x.slug;
    }),
    ["confirmation"],
  );
  assert.deepEqual(d.folded, []);
});

test("fold: no declaration at all behaves exactly as before", function () {
  var d = classify._diffRegistry(BEFORE, AFTER);
  assert.deepEqual(
    d.removed.map(function (x) {
      return x.slug;
    }),
    ["confirmation"],
  );
  assert.deepEqual(d.folded, []);
});
