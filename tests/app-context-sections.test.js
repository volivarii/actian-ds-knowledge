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

const os = require("node:os");
const {
  readSections,
  checkSectionReferences,
  writeSections,
} = require("../scripts/app-context/derive-sections");

function tmpSrc(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sections-"));
  fs.mkdirSync(path.join(dir, "sections"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(
      path.join(dir, "sections", name),
      typeof body === "string" ? body : JSON.stringify(body),
    );
  }
  return dir;
}

test("readSections: absent directory is an error, not zero sections", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nosections-"));
  const { sections, errors } = readSections(dir, SECTION_SCHEMA);
  assert.deepEqual(sections, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /does not exist/);
});

test("readSections: slug must equal filename, JSON must be an object, schema must pass", () => {
  const dir = tmpSrc({
    "item-header.json": VALID_SECTION,
    "wrong-name.json": Object.assign({}, VALID_SECTION, { slug: "item-header" }),
    "scalar.json": "42",
    "broken.json": "{",
    "norole.json": (() => {
      const d = Object.assign({}, VALID_SECTION, { slug: "norole" });
      delete d.role;
      return d;
    })(),
  });
  const { sections, errors } = readSections(dir, SECTION_SCHEMA);
  assert.deepEqual(sections.map((s) => s.slug), ["item-header"]);
  assert.equal(errors.length, 4, errors.join("\n"));
  assert.ok(errors.some((e) => /wrong-name\.json.*slug/.test(e)));
  assert.ok(errors.some((e) => /scalar\.json.*not a JSON object/.test(e)));
  assert.ok(errors.some((e) => /broken\.json.*invalid JSON/.test(e)));
  assert.ok(errors.some((e) => /norole\.json.*schema errors/.test(e)));
});

test("readSections: a section referencing a section is an error (sections are flat)", () => {
  const nested = Object.assign({}, VALID_SECTION, {
    slug: "nested",
    skeleton: {
      content: [
        { type: "FRAME", name: "Wrap", children: [{ type: "SECTION", section: "item-header" }] },
      ],
    },
  });
  const dir = tmpSrc({ "nested.json": nested });
  const { sections, errors } = readSections(dir, SECTION_SCHEMA);
  assert.deepEqual(sections, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /nested\.json.*SECTION node.*flat/);
});

test("checkSectionReferences: unknown app or pattern is an error", () => {
  const ctx = { apps: { studio: {} }, patterns: { "asset-detail-360": {} } };
  assert.deepEqual(checkSectionReferences([VALID_SECTION], ctx), []);
  const bad = Object.assign({}, VALID_SECTION, { apps: ["nope"], patterns: ["nada"] });
  const errors = checkSectionReferences([bad], ctx);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /unknown app 'nope'/);
  assert.match(errors[1], /unknown pattern 'nada'/);
});

test("writeSections: stamps, writes one leaf per slug, prunes stale leaves", () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "sections-dist-"));
  fs.mkdirSync(path.join(dist, "sections"));
  fs.writeFileSync(path.join(dist, "sections", "stale.json"), "{}");
  const n = writeSections(dist, [VALID_SECTION], { auto_generated: true });
  assert.equal(n, 1);
  const files = fs.readdirSync(path.join(dist, "sections")).sort();
  assert.deepEqual(files, ["item-header.json"]);
  const leaf = JSON.parse(fs.readFileSync(path.join(dist, "sections", "item-header.json"), "utf8"));
  assert.equal(leaf._schema_version, 1);
  assert.deepEqual(leaf._meta, { auto_generated: true });
  assert.equal(leaf.kind, "section");
});
