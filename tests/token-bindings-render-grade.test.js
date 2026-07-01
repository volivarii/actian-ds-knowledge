"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const REPO_ROOT = path.resolve(__dirname, "..");
const derive = require(
  path.join(REPO_ROOT, "scripts", "components", "derive-guidelines"),
);
const validators = derive.makeValidators(REPO_ROOT);

function load(slug) {
  const raw = fs.readFileSync(
    path.join(REPO_ROOT, "components", "src", slug, "tokens.yml"),
    "utf8",
  );
  return YAML.parse(raw);
}

function graded(data) {
  return data.bindings.filter(
    (b) => typeof b.property === "string" && b.property.length > 0,
  );
}

// Expected render-grade counts per pilot (default-state, root-level bindings).
const EXPECTED = { card: 13, tag: 13, checkbox: 7, input: 11 };

for (const slug of Object.keys(EXPECTED)) {
  test(`pilot ${slug}: validates and has expected render-grade count`, () => {
    const data = load(slug);
    assert.equal(
      validators.tokens(data),
      true,
      JSON.stringify(validators.tokens.errors),
    );
    assert.equal(graded(data).length, EXPECTED[slug]);
  });
}

test("pilot card: fill and padding map to the right properties", () => {
  const data = load("card");
  const fill = data.bindings.find((b) => b.token === "color-bg-default");
  const pad = data.bindings.find((b) => b.token === "spacing-md");
  assert.equal(fill.property, "background-color");
  assert.equal(pad.property, "padding");
});

test("pilot card: selected-state bindings are left unmapped (deferred)", () => {
  const data = load("card");
  const selectedFill = data.bindings.find(
    (b) => b.token === "color-bg-selected",
  );
  assert.equal(selectedFill.property, undefined);
});
