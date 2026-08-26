"use strict";

// A Figma re-key is not a removal.
//
// `diffRegistry` pairs components by Figma `key`, which is right for renames:
// a component that changes name keeps its key, so resolution survives. But
// dissolving a component SET publishes its child as a NEW node with a NEW key,
// and the DS Kit reorg of 2026-08-26 did that six times. Each one arrived as a
// removal plus an addition of the SAME slug carrying the SAME display name,
// and a removal makes the sync breaking, which stalls the whole pipeline for
// something no consumer can observe.
//
// The test of a removal is what a consumer can still resolve, not whether a
// Figma node kept its identity. A slug that still resolves, to a component of
// the same name, has been re-keyed. A slug that resolves to a DIFFERENT name
// is a substitution and stays breaking: silently repointing a slug at another
// component is worse than removing it, because nothing tells the consumer.

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var classify = require(
  path.join(__dirname, "..", "scripts", "changelog", "changelog-classifier.js"),
);
var diffRegistry = classify._diffRegistry;

function reg(components) {
  return { components: components };
}

test("re-key: a dissolved set republished under the same slug and name is not a removal", function () {
  var before = reg({
    "action-bar": { key: "OLDKEY", name: "Action bar", importMethod: "set" },
  });
  var after = reg({
    "action-bar": { key: "NEWKEY", name: "Action bar", importMethod: "single" },
  });

  var d = diffRegistry(before, after);

  assert.deepEqual(
    d.removed.map(function (r) {
      return r.slug;
    }),
    [],
    "nothing was removed: the slug still resolves",
  );
  assert.deepEqual(
    d.added.map(function (a) {
      return a.slug;
    }),
    [],
    "nor is it a new component",
  );
  assert.deepEqual(
    d.rekeyed.map(function (r) {
      return r.slug;
    }),
    ["action-bar"],
    "it is reported as a re-key, not silently dropped",
  );
});

test("re-key: the same slug carrying a DIFFERENT name stays a removal", function () {
  var before = reg({ card: { key: "OLDKEY", name: "Card" } });
  var after = reg({ card: { key: "NEWKEY", name: "Card for items" } });

  var d = diffRegistry(before, after);

  assert.deepEqual(
    d.removed.map(function (r) {
      return r.slug;
    }),
    ["card"],
    "a slug repointed at a different component is a substitution, not a re-key",
  );
  assert.deepEqual(d.rekeyed, []);
});

test("re-key: a genuine removal is still a removal", function () {
  var before = reg({ "error-state": { key: "K1", name: "Error state" } });
  var after = reg({});

  var d = diffRegistry(before, after);

  assert.deepEqual(
    d.removed.map(function (r) {
      return r.slug;
    }),
    ["error-state"],
  );
  assert.deepEqual(d.rekeyed, []);
});

test("re-key: a re-keyed component does not make the sync breaking", function () {
  var before = reg({
    "action-bar": { key: "OLDKEY", name: "Action bar", importMethod: "set" },
  });
  var after = reg({
    "action-bar": { key: "NEWKEY", name: "Action bar", importMethod: "single" },
  });

  var r = classify({
    fileKind: "registry",
    before: before,
    after: after,
  });

  assert.equal(r.category, "additive");
  assert.deepEqual(r.reasons, []);
});

test("re-key: a genuine removal alongside a re-key still breaks the night", function () {
  var before = reg({
    "action-bar": { key: "OLDKEY", name: "Action bar" },
    "error-state": { key: "K1", name: "Error state" },
  });
  var after = reg({ "action-bar": { key: "NEWKEY", name: "Action bar" } });

  var r = classify({ fileKind: "registry", before: before, after: after });

  assert.equal(r.category, "breaking");
  assert.equal(r.reasons.length, 1, "only the real removal is a reason");
  assert.match(r.reasons[0], /Error state/);
});

test("re-key: the changelog names re-keys so they are not silent", function () {
  var before = reg({
    "action-bar": { key: "OLDKEY", name: "Action bar", importMethod: "set" },
  });
  var after = reg({
    "action-bar": { key: "NEWKEY", name: "Action bar", importMethod: "single" },
  });

  var r = classify({ fileKind: "registry", before: before, after: after });

  assert.match(r.changelog, /Action bar/);
  assert.match(r.changelog, /[Rr]e-?keyed/);
});

// ---- a re-key must not launder a contract change ----

test("re-key: dropping a multi-value variant axis stays breaking", function () {
  // Same slug, same name, new Figma key — but the component lost a real
  // choice. The re-key classification says "this is the same component under a
  // new node"; it must not also say "nothing changed".
  var before = reg({
    tabs: {
      key: "OLDKEY",
      name: "Tabs",
      variants: { Type: ["Default", "Compact", "Pill"] },
    },
  });
  var after = reg({ tabs: { key: "NEWKEY", name: "Tabs", variants: {} } });

  var r = classify({ fileKind: "registry", before: before, after: after });

  assert.equal(r.category, "breaking");
  assert.ok(
    r.reasons.some(function (x) {
      return /variant axis 'Type'/.test(x);
    }),
    "the lost axis is named: " + JSON.stringify(r.reasons),
  );
});

test("re-key: dropping a property stays breaking", function () {
  var before = reg({
    tabs: { key: "OLDKEY", name: "Tabs", properties: { label: {} } },
  });
  var after = reg({ tabs: { key: "NEWKEY", name: "Tabs", properties: {} } });

  var r = classify({ fileKind: "registry", before: before, after: after });

  assert.equal(r.category, "breaking");
});

test("re-key: a single-value axis is still a change worth blocking on", function () {
  // The six dissolved DS Kit sets each carried one axis holding exactly
  // ["Default"], so no consumer could ever have chosen anything else. It is
  // tempting to wave that through. It is not waved through, because the render
  // layer keys anatomy lookups on the variant combination, so the key changes
  // from `Property 1=Default` to no key at all. Deliberate, and asserted so
  // that relaxing it later has to be a decision rather than a drift.
  var before = reg({
    "action-bar": {
      key: "OLDKEY",
      name: "Action bar",
      variants: { "Property 1": ["Default"] },
    },
  });
  var after = reg({
    "action-bar": { key: "NEWKEY", name: "Action bar", variants: {} },
  });

  var r = classify({ fileKind: "registry", before: before, after: after });

  assert.equal(r.category, "breaking");
  assert.equal(
    classify._diffRegistry(before, after).rekeyed.length,
    1,
    "still reported as a re-key, not as a removal",
  );
  assert.deepEqual(classify._diffRegistry(before, after).removed, []);
});

// ---- a re-key reports its identity change; the SHAPE change is a modification ----

test("re-key: a changed importMethod is reported, not silently dropped", function () {
  // Dissolving a set changes `importMethod` from "set" to "single", which is a
  // required consumer-facing registry field telling a consumer how to import
  // the component. Pairing the removal with the addition must not swallow it.
  var before = reg({
    "action-bar": { key: "OLDKEY", name: "Action bar", importMethod: "set" },
  });
  var after = reg({
    "action-bar": { key: "NEWKEY", name: "Action bar", importMethod: "single" },
  });

  var d = classify._diffRegistry(before, after);

  assert.equal(d.rekeyed.length, 1, "still a re-key");
  assert.deepEqual(
    d.modified.map(function (m) {
      return m.slug;
    }),
    ["action-bar"],
    "and the field change is reported as a modification",
  );

  var r = classify({ fileKind: "registry", before: before, after: after });
  assert.match(r.changelog, /Modified/);
});

test("re-key: the changelog shows why a breaking re-key broke the night", function () {
  // The PR body is built from the changelog alone; `verdict.reasons` is never
  // rendered. A breaking night whose body says only "Nothing to resolve
  // differently" leaves the person who has to unstall it with no cause.
  var before = reg({
    tabs: {
      key: "OLDKEY",
      name: "Tabs",
      variants: { Type: ["Default", "Compact"] },
    },
  });
  var after = reg({ tabs: { key: "NEWKEY", name: "Tabs", variants: {} } });

  var r = classify({ fileKind: "registry", before: before, after: after });

  assert.equal(r.category, "breaking");
  assert.match(
    r.changelog,
    /variant axis 'Type'/,
    "the cause must appear in the body: " + r.changelog,
  );
});

test("re-key: the section never claims nothing changed", function () {
  var before = reg({
    tabs: { key: "OLDKEY", name: "Tabs", variants: { Type: ["A", "B"] } },
  });
  var after = reg({ tabs: { key: "NEWKEY", name: "Tabs", variants: {} } });

  var r = classify({ fileKind: "registry", before: before, after: after });

  assert.doesNotMatch(r.changelog, /Nothing to resolve differently/);
});
