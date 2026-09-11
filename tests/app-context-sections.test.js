"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv/dist/2020");

const ROOT = path.join(__dirname, "..");
const SECTION_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(ROOT, "schemas", "app-context-section.json"), "utf8"),
);
const RECIPE_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(ROOT, "schemas", "app-context-recipe.json"), "utf8"),
);

const VALID_SECTION = {
  _schema_version: 1,
  kind: "section",
  slug: "item-header",
  label: "Item header",
  description: "Identity row over three metadata lines.",
  role: "header",
  apps: ["studio"],
  derivedFrom: { surface: "Studio > Catalog > Dataset > General", capturedOn: "2026-08-18" },
  skeleton: { content: [{ type: "FRAME", name: "Item header", children: [] }] },
};

test("section schema accepts a valid record and rejects malformed ones", () => {
  const ajv = new Ajv({ strict: false, allowUnionTypes: true });
  const v = ajv.compile(SECTION_SCHEMA);
  assert.ok(v(VALID_SECTION), JSON.stringify(v.errors));

  const noKind = Object.assign({}, VALID_SECTION);
  delete noKind.kind;
  assert.equal(v(noKind), false, "kind is required");

  const badRole = Object.assign({}, VALID_SECTION, { role: "hero" });
  assert.equal(v(badRole), false, "role must be from the enum");

  const noContent = Object.assign({}, VALID_SECTION, { skeleton: {} });
  assert.equal(v(noContent), false, "skeleton.content is required");

  const chrome = Object.assign({}, VALID_SECTION, {
    skeleton: { chrome: "standard", content: [] },
  });
  assert.equal(v(chrome), false, "a section has no chrome");

  const extra = Object.assign({}, VALID_SECTION, { pageRecipe: "x" });
  assert.equal(v(extra), false, "root is strict");
});

test("recipe schema accepts the derive's `sections` stamp", () => {
  const ajv = new Ajv({ strict: false, allowUnionTypes: true });
  const v = ajv.compile(RECIPE_SCHEMA);
  const recipe = {
    _schema_version: 1,
    slug: "asset-detail-360",
    label: "x",
    description: "x",
    apps: ["studio"],
    derivedFrom: { surface: "x", capturedOn: "2026-08-18" },
    skeleton: { chrome: "standard", content: [] },
    sections: ["item-header", "facet-tabs"],
  };
  assert.ok(v(recipe), JSON.stringify(v.errors));
  assert.equal(
    v(Object.assign({}, recipe, { sections: [1] })),
    false,
    "sections must be strings",
  );
});
