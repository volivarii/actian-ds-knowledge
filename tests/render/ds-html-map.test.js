"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

var DS_PATH = "../../components/render/renderer/html-renderers/ds-html-map.js";

test("digram-item-types: known color, no token, renders initials", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    variant: "Item type=Dataset, Size=Default",
    props: { Initials: "DS" },
  });
  assert.match(html, /class="ds-item-type"/, "carries the base class");
  assert.match(
    html,
    /background:#cfeafd/,
    "Dataset's captured color, no token",
  );
  assert.match(html, />DS</, "renders the initials");
});

test("digram-item-types: known color WITH a captured token, uses var() with fallback", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    variant: "Item type=Field, Size=Default",
    props: { Initials: "FL" },
  });
  assert.match(
    html,
    /background:var\(--zen-color-success-50, #d3efcd\)/,
    "Field carries its captured token with the hex fallback",
  );
});

test("digram-item-types: unmapped Item type falls back to the Category default", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    variant: "Item type=Custom 1, Size=Default",
    props: { Initials: "C1" },
  });
  assert.match(
    html,
    /background:#ffdacf/,
    "Custom 1 has no captured entry, falls back to Category's color",
  );
});

test("digram-item-types: Size becomes a modifier class", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    variant: "Item type=Dataset, Size=Small",
    props: { Initials: "DS" },
  });
  assert.match(
    html,
    /ds-item-type ds-item-type--small/,
    "Size lowercases into a modifier class",
  );
});

test("digram-item-types: escapes hostile Initials", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    variant: "Item type=Dataset, Size=Default",
    props: { Initials: "<img src=x onerror=1>" },
  });
  assert.match(html, /&lt;img/, "initials escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("digram-topic: known Type, renders its color and initials", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-topic",
    variant: "Type=Dark blue",
    props: { Initials: "TP" },
  });
  assert.match(html, /class="ds-topic"/, "carries the base class");
  assert.match(html, /background:#003786/, "Dark blue's captured color");
  assert.match(html, />TP</, "renders the initials");
});

test("digram-topic: default Type (Light purple) when variant omits Type", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-topic",
    variant: "",
    props: { Initials: "LP" },
  });
  assert.match(
    html,
    /background:#a17ab6/,
    "falls back to Light purple's color",
  );
});

test("digram-topic: escapes hostile Initials", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-topic",
    variant: "Type=Red",
    props: { Initials: "<svg onload=1>" },
  });
  assert.match(html, /&lt;svg/, "initials escaped");
  assert.doesNotMatch(html, /<svg onload/, "no raw injection");
});
