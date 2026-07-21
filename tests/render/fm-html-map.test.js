"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

var FM_PATH = "../../components/render/renderer/html-renderers/fm-html-map.js";

test("fm-html-map requires cleanly in knowledge (no lib/paths coupling)", function () {
  assert.doesNotThrow(function () {
    require(FM_PATH);
  }, "fm-html-map loads standalone, no external requires");
});

test("renderFMComponent: fmButton renders its type, size, and label", function () {
  var FM = require(FM_PATH);
  var html = FM.renderFMComponent({
    type: "INSTANCE",
    ref: "fmButton",
    variant: "Type=Primary, Size=md",
    props: { Label: "Save" },
  });
  assert.match(html, /fm-button--primary/, "carries the type class");
  assert.match(html, /fm-button--md/, "carries the size class");
  assert.match(html, />Save</, "carries the label text");
});

test("renderFMComponent: fmDropdown renders its open state and text", function () {
  var FM = require(FM_PATH);
  var html = FM.renderFMComponent({
    type: "INSTANCE",
    ref: "fmDropdown",
    variant: "Type=Open",
    props: { "Dropdown Text": "Choose one" },
  });
  assert.match(html, /fm-dropdown--open/, "carries the open-state class");
  assert.match(html, />Choose one</, "carries the dropdown text");
});

test("renderFMComponent: an unmapped ref degrades to a graceful named chip, never a raw [ref]", function () {
  var FM = require(FM_PATH);
  var html = FM.renderFMComponent({
    type: "INSTANCE",
    ref: "fmSomeUnmappedThing",
    name: "Mystery Widget",
  });
  assert.match(
    html,
    /class="fm-component"/,
    "falls back to the graceful chip",
  );
  assert.match(html, />Mystery Widget</, "shows the human name");
  assert.ok(
    html.indexOf("[fmSomeUnmappedThing]") === -1,
    "never a raw [ref] token",
  );
});

test("esc: escapes HTML-special characters", function () {
  var FM = require(FM_PATH);
  assert.equal(
    FM.esc("<a>&\"b\"</a>"),
    "&lt;a&gt;&amp;&quot;b&quot;&lt;/a&gt;",
  );
});

test("normalizeProps: a Figma '#id'-suffixed key still resolves via its base name", function () {
  var FM = require(FM_PATH);
  var html = FM.renderFMComponent({
    type: "INSTANCE",
    ref: "fmButton",
    variant: "Type=Primary, Size=md",
    props: { "Label#1411:32": "Save" },
  });
  assert.match(
    html,
    />Save</,
    "the suffixed prop key still resolves to Label",
  );
});
