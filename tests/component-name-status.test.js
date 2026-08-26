"use strict";

// Status is authored ON THE COMPONENT, not on the Figma page.
//
// The DS Kit reorg (Figma v2.7.0, 2026-08-26) removed the status emoji from
// every member page name and moved it onto the component itself (7 sets carry
// a leading ✍️ / ⛔️). Two things follow, and both are asserted here:
//
//   1. the emoji must SET `status` and be STRIPPED from the shipped `name`,
//      or docs and the plugin render "✍️ Badge" as a display name;
//   2. a page name must NO LONGER set status. `/components` returns
//      `containing_frame.pageName` as of the last publish, so a page renamed
//      without republishing still carries its old emoji — page-derived status
//      is therefore a stale-metadata artifact, not a signal.

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var transformRegistry = require(
  path.join(__dirname, "..", "scripts", "transformers", "transform-registry.js"),
);

function setInput(setName, pageName) {
  return {
    library: "dsKit",
    fileKey: "k",
    componentSets: [
      {
        name: setName,
        key: "kSET",
        node_id: "10:0",
        description: "",
        containing_frame: { pageName: pageName, name: "Frame" },
      },
    ],
    componentSetNodes: {
      "10:0": { document: { type: "COMPONENT_SET", children: [] } },
    },
    standalones: [],
    standaloneNodes: {},
    documentChildren: [
      { type: "CANVAS", name: "🧱 COMPONENTS" },
      { type: "CANVAS", name: "Data Display" },
      { type: "CANVAS", name: "     Badge" },
    ],
  };
}

test("component-name status: ✍️ on the set name sets in-progress and is stripped from name", function () {
  var reg = transformRegistry(setInput("✍️ Badge", "     Badge"));
  var e = reg.components["badge"];
  assert.ok(e, "badge should be in the registry");
  assert.equal(e.status, "in-progress");
  assert.equal(e.name, "Badge");
});

test("component-name status: ⛔️ on the set name sets deprecated and is stripped from name", function () {
  var reg = transformRegistry(setInput("⛔️ Popover", "     Badge"));
  var e = reg.components["popover"];
  assert.ok(e, "popover should be in the registry");
  assert.equal(e.status, "deprecated");
  assert.equal(e.name, "Popover");
});

test("component-name status: ✅ on the set name omits status and is stripped from name", function () {
  var reg = transformRegistry(setInput("✅ Badge", "     Badge"));
  var e = reg.components["badge"];
  assert.equal(e.status, undefined, "curated is implicit — no status field");
  assert.equal(e.name, "Badge");
});

test("component-name status: a plain set name yields no status field", function () {
  var reg = transformRegistry(setInput("Badge", "     Badge"));
  assert.equal(reg.components["badge"].status, undefined);
  assert.equal(reg.components["badge"].name, "Badge");
});

test("page-name status is NOT a driver: an emoji PAGE sets no status", function () {
  // Both planes agree the page is "     \u270d\ufe0f Badge" (emoji still on the
  // page) and the component name is plain. Status must still be absent:
  // the page is no longer a status driver, only the component name is.
  var input = setInput("Badge", "     \u270d\ufe0f Badge");
  input.documentChildren[2] = { type: "CANVAS", name: "     \u270d\ufe0f Badge" };
  var reg = transformRegistry(input);
  assert.equal(reg.components["badge"].category, "Data Display", "page still joins");
  assert.equal(reg.components["badge"].status, undefined);
});

test("page-name status is NOT a driver: the component emoji wins over the page emoji", function () {
  var reg = transformRegistry(setInput("⛔️ Badge", "     ✍️ Badge"));
  assert.equal(reg.components["badge"].status, "deprecated");
  assert.equal(reg.components["badge"].name, "Badge");
});

// ---- the drift guard must not resurrect a status ----

var syncMod = require(
  path.join(__dirname, "..", "scripts", "sync", "sync-from-figma.js"),
);

test("category drift restores page attribution but NOT status", function () {
  // `checkbox-card` in the live DS Kit: its published page name is stale, so
  // the category join fails and the drift guard restores last-known-good.
  // Category/section/group are page-derived and SHOULD come back. `status` is
  // authored on the component name now, so restoring it from the previous
  // dist resurrects a value Figma no longer asserts.
  var before = {
    components: {
      "checkbox-card": {
        key: "kCC",
        name: "Checkbox card",
        category: "Form",
        categorySlug: "form",
        section: "Components",
        group: "Checkbox card",
        status: "in-progress",
      },
    },
  };
  var after = {
    components: {
      "checkbox-card": { key: "kCC", name: "Checkbox card", page: "stale" },
    },
  };

  var drift = syncMod.preserveKnownCategories(before, after);

  assert.equal(drift.length, 1, "the drift should be reported");
  var c = after.components["checkbox-card"];
  assert.equal(c.category, "Form", "page-derived category is restored");
  assert.equal(c.section, "Components", "page-derived section is restored");
  assert.equal(c.group, "Checkbox card", "page-derived group is restored");
  assert.equal(c.status, undefined, "status must NOT be resurrected");
});

test("category drift leaves a component-authored status untouched", function () {
  var before = {
    components: {
      badge: { key: "kB", name: "Badge", category: "Data Display" },
    },
  };
  var after = {
    components: {
      badge: { key: "kB", name: "Badge", page: "stale", status: "deprecated" },
    },
  };

  syncMod.preserveKnownCategories(before, after);

  assert.equal(
    after.components["badge"].status,
    "deprecated",
    "the component's own emoji still decides",
  );
});

// ---- the gate: no emoji may reach a shipped `name` ----

test("assertNoEmojiInNames: throws on an unrecognised emoji left in a name", function () {
  // 🟢 is not in the status vocabulary, so extractStatus leaves it in the
  // name. It already exists in the DS Kit as a `Dev status` variant value, so
  // the day it lands on a component name it must fail loudly rather than ship
  // "🟢 Modal" as a display name to the docs site and the plugin.
  var registry = { components: { modal: { name: "🟢 Modal" } } };
  assert.throws(
    function () {
      syncMod.assertNoEmojiInNames(registry);
    },
    /modal/,
    "the offending slug must be named in the error",
  );
});

test("assertNoEmojiInNames: throws on an emoji in the icons namespace too", function () {
  var registry = {
    components: { button: { name: "Button" } },
    icons: { add: { name: "✍️ add" } },
  };
  assert.throws(function () {
    syncMod.assertNoEmojiInNames(registry);
  }, /add/);
});

test("assertNoEmojiInNames: passes a clean registry", function () {
  var registry = {
    components: { badge: { name: "Badge" }, modal: { name: "Modal" } },
  };
  assert.doesNotThrow(function () {
    syncMod.assertNoEmojiInNames(registry);
  });
});

test("assertNoEmojiInNames: ordinary punctuation is not an emoji", function () {
  var registry = {
    components: {
      x: { name: "Segmented control (Button group)" },
      y: { name: "Tag, item type" },
      z: { name: "Base: field & label" },
    },
  };
  assert.doesNotThrow(function () {
    syncMod.assertNoEmojiInNames(registry);
  });
});

test("assertNoEmojiInNames: refuses to pass when entries exist but none carry a name", function () {
  // THE FALSE ALL-CLEAR: entries ARE present, so the gate believes it checked
  // something, but no entry exposed a `name` to check. That is the shape that
  // reports clean while its subject is absent.
  assert.throws(function () {
    syncMod.assertNoEmojiInNames({ components: { a: {}, b: { name: 7 } } });
  }, /inspected no names/);
});

test("assertNoEmojiInNames: an empty kit is not a failure", function () {
  // fmKit/metaKit can legitimately come back with no components (a kit that
  // is not configured, or a stubbed REST in tests). No entries means nothing
  // to check, which is different from entries that hid their names.
  assert.doesNotThrow(function () {
    syncMod.assertNoEmojiInNames({ components: {} });
  });
});

// ---- review findings ----

var statusParser = require(
  path.join(__dirname, "..", "scripts", "transformers", "component-status-emoji.js"),
);
var deferredRemovals = require(
  path.join(__dirname, "..", "scripts", "sync", "deferred-removals.js"),
);

test("status emoji: the variation selector is optional (⚠ and ⚠️ both parse)", function () {
  // Finding 5: COMPONENT_STATUS_MAP keys are exact code-point sequences, so a
  // near-miss form used to fall through extractStatus and then trip the gate,
  // costing the whole night for a typo. Match on the base code point.
  assert.equal(statusParser.extractStatus("⚠ Tooltip").status, "warn");
  assert.equal(statusParser.extractStatus("⚠️ Tooltip").status, "warn");
  assert.equal(statusParser.extractStatus("✅️ Calendar").cleanName, "Calendar");
  assert.equal(statusParser.extractStatus("✅ Calendar").cleanName, "Calendar");
});

test("status emoji: the space after the emoji is optional", function () {
  var r = statusParser.extractStatus("⛔️Popover");
  assert.equal(r.status, "deprecated");
  assert.equal(r.cleanName, "Popover");
});

test("slug collision: two masters sharing an emoji name are a duplicate, not a loss", function () {
  // Finding 2: entrySide carries the cleaned name and metaSide carried the raw
  // one, so a benign duplicate master reported as "🚨 LOST COMPONENT".
  var seen = [];
  transformRegistry({
    library: "ds",
    fileKey: "k",
    componentSets: [
      { name: "✍️ Badge", key: "kA", node_id: "1:1", description: "", containing_frame: { pageName: "     Badge" } },
      { name: "✍️ Badge", key: "kB", node_id: "1:2", description: "", containing_frame: { pageName: "     Badge" } },
    ],
    componentSetNodes: { "1:1": { document: {} }, "1:2": { document: {} } },
    standalones: [],
    standaloneNodes: {},
    documentChildren: [
      { type: "CANVAS", name: "🧱 COMPONENTS" },
      { type: "CANVAS", name: "Data Display" },
      { type: "CANVAS", name: "     Badge" },
    ],
    onWarnings: function (ws) {
      (ws || []).forEach(function (w) {
        if (w.code === "SLUG_COLLISION_DROPPED") seen.push(w.severity);
      });
    },
  });
  assert.deepEqual(seen, ["duplicate"], "same component published twice is not a loss");
});

test("deferral reinstate: a carried legacy name is normalised, not shipped with its emoji", function () {
  // Finding 1: reinstate copies the previous dist's entry verbatim, and that
  // dist still holds emoji names. Carried unchanged, it trips the gate and
  // turns the whole night into `error` — the exact outcome deferrals exist to
  // avoid, with a remedy ("rename it in Figma") that is impossible for a
  // component no longer in Figma.
  var before = {
    components: { popover: { name: "⛔️ Popover", key: "kP", nodeId: "1:1" } },
  };
  var after = { components: {} };
  var out = deferredRemovals.reinstate(before, after, [
    { slug: "popover", deferral: { reason: "r", issue: 1, review_by: "2026-12-01" } },
  ]);
  assert.equal(out.components["popover"].name, "Popover");
  assert.equal(out.components["popover"].status, "deprecated");
  assert.doesNotThrow(function () {
    syncMod.assertNoEmojiInNames(out);
  }, "a reinstated entry must not trip the emoji gate");
});
