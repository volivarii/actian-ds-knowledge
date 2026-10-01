"use strict";
// An authored empty string is a value (#717): a screen that gives a part ""
// draws no part, where an absent prop still draws the Figma specimen's copy.
// Found composing the product recipes (2026-09-30): asset-detail-360's empty
// relations block has no body and no buttons, and properties-panel labels each
// control with a TEXT beside it, which a calendar printing "Date" defeated.
const test = require("node:test");
const assert = require("node:assert/strict");
const DS = require("../../components/render/renderer/html-renderers/ds-html-map.js");

const render = (dsSlug, props, variant) => DS.renderDSComponent({ dsSlug, variant, props });

test("empty-state: an empty body and empty actions draw nothing of the specimen", () => {
  const html = render("empty-state", { Headline: "No related Datasets", Body: "", Cta: "", Secondary: "" });
  assert.ok(html.includes("No related Datasets"));
  for (const part of ["ds-empty-state__body", "ds-empty-state__actions", "Create policies", "Create policy", "Learn more"]) {
    assert.ok(!html.includes(part), part);
  }
});

test("empty-state: one empty button leaves the other", () => {
  const html = render("empty-state", { Headline: "H", Body: "B", Cta: "Add", Secondary: "" });
  assert.equal((html.match(/ds-empty-state__cta/g) || []).length, 1);
  assert.ok(html.includes(">Add<") && !html.includes("Learn more"));
});

test("empty-state: absent props still draw the specimen, for the gallery", () => {
  const html = render("empty-state", {});
  for (const part of ["No policies available", "Create policies to define", "Create policy", "Learn more"]) assert.ok(html.includes(part), part);
});

test("calendar: an empty Label draws no label row; an absent one draws the specimen's Date", () => {
  const v = "Type=Single date, States=Filled";
  const empty = render("calendar", { Label: "", "Placeholder text": "2025/09/23" }, v);
  assert.ok(!empty.includes("ds-calendar__label"), "label row drawn");
  assert.ok(empty.includes("2025/09/23"));
  assert.match(render("calendar", {}, v), /ds-calendar__label">Date</);
  assert.match(render("calendar", { Label: "Data Contract Creation Date" }, v), /ds-calendar__label">Data Contract Creation Date</);
});
