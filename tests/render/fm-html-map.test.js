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

test("renderFMComponent: fmDialog reads Title and Body, and prints neither literal without them", function () {
  var FM = require(FM_PATH);
  var html = FM.renderFMComponent({
    type: "INSTANCE",
    ref: "fmDialog",
    props: { Title: "Publish data product?", Body: "Consumers see it in the catalog." },
  });
  assert.match(html, /fm-dialog__title">Publish data product\?</, "Title reaches the title element");
  assert.match(html, /fm-dialog__body">Consumers see it in the catalog\.</, "Body reaches the body element");
  var bare = FM.renderFMComponent({ type: "INSTANCE", ref: "fmDialog", props: {} });
  assert.doesNotMatch(bare, />Dialog</, "no literal title the caller did not write");
  assert.doesNotMatch(bare, /fm-dialog__title|fm-dialog__body/, "no empty title or body element");
  assert.match(bare, /class="fm-dialog"/, "the panel itself renders");
});

test("renderFMComponent: fmEmptyState reads Headline, Body and Cta, and prints no literal without them", function () {
  var FM = require(FM_PATH);
  var html = FM.renderFMComponent({
    type: "INSTANCE",
    ref: "fmEmptyState",
    variant: "Property 1=Default",
    props: {
      Headline: "No data products yet",
      Body: "Publish one to see it here.",
      Cta: "Publish data product",
    },
  });
  assert.match(html, /fm-empty-state__text">No data products yet</, "Headline reaches the text element");
  assert.match(html, /fm-empty-state__body">Publish one to see it here\.</, "Body reaches its own element");
  assert.match(
    html,
    /fm-button fm-button--primary fm-button--md">Publish data product</,
    "Cta reuses the fm-button markup",
  );
  var bare = FM.renderFMComponent({ type: "INSTANCE", ref: "fmEmptyState", props: {} });
  assert.doesNotMatch(bare, /No items/, "no literal headline the caller did not write");
  assert.doesNotMatch(bare, /fm-empty-state__text|fm-empty-state__body|fm-button/, "no empty text elements");
  assert.match(bare, /fm-empty-state__icon/, "the icon well stays");
});
