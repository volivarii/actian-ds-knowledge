"use strict";

// A re-key must not erase a component's slug history.
//
// The ledger keys entries by `key || nodeId`, and drops entries whose identity
// has left the registries. That is right for a retirement. It is wrong for a
// re-key: dissolving a component set republishes the same slug under a new
// Figma key, so the old entry drops and the new one starts with an empty
// history.
//
// On the DS Kit reorg that is not hypothetical. `action-bar` carries
// `previousSlugs: ["sticky-footer"]`, and it is one of the six re-keyed
// components, so `sticky-footer` would stop resolving for every consumer that
// still addresses it. `previousSlugs` is history, and history is the one thing
// in this file that cannot be recovered from current state.

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var deriveIdentity = require(
  path.join(__dirname, "..", "scripts", "components", "derive-identity.js"),
);

test("re-key carries the previous slug history onto the new identity", function () {
  var previous = {
    entries: {
      OLDKEY: {
        slug: "action-bar",
        nodeId: "1:1",
        previousSlugs: ["sticky-footer"],
      },
    },
  };
  var registries = [
    {
      components: {
        "action-bar": { key: "NEWKEY", nodeId: "2:2", name: "Action bar" },
      },
    },
  ];

  var ledger = deriveIdentity.buildIdentity(registries, previous, {
    NEWKEY: "OLDKEY",
  });

  assert.deepEqual(
    ledger.entries["NEWKEY"].previousSlugs,
    ["sticky-footer"],
    "history survives the re-key",
  );
  assert.equal(ledger.entries["OLDKEY"], undefined, "the old id is not kept");
});

test("re-key with a slug change records the old slug AND keeps older history", function () {
  var previous = {
    entries: {
      OLDKEY: { slug: "tabs", nodeId: "1:1", previousSlugs: ["tab-group"] },
    },
  };
  var registries = [
    { components: { tab: { key: "NEWKEY", nodeId: "2:2", name: "Tab" } } },
  ];

  var ledger = deriveIdentity.buildIdentity(registries, previous, {
    NEWKEY: "OLDKEY",
  });

  assert.deepEqual(ledger.entries["NEWKEY"].previousSlugs.sort(), [
    "tab-group",
    "tabs",
  ]);
});

test("without a re-key pairing, a vanished identity still drops (unchanged)", function () {
  var previous = {
    entries: {
      OLDKEY: { slug: "gone", nodeId: "1:1", previousSlugs: ["older"] },
    },
  };
  var registries = [
    { components: { other: { key: "K2", nodeId: "2:2", name: "Other" } } },
  ];

  var ledger = deriveIdentity.buildIdentity(registries, previous);

  assert.equal(ledger.entries["OLDKEY"], undefined);
  assert.deepEqual(ledger.entries["K2"].previousSlugs, []);
});

test("a re-key pairing naming an unknown old identity is ignored, not fatal", function () {
  var previous = { entries: {} };
  var registries = [
    { components: { a: { key: "NEWKEY", nodeId: "2:2", name: "A" } } },
  ];

  var ledger = deriveIdentity.buildIdentity(registries, previous, {
    NEWKEY: "NOSUCHKEY",
  });

  assert.deepEqual(ledger.entries["NEWKEY"].previousSlugs, []);
});
