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

  const emptyContent = Object.assign({}, VALID_SECTION, {
    skeleton: { content: [] },
  });
  assert.equal(v(emptyContent), false, "skeleton.content must hold at least one node");

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
  try {
    const { sections, errors } = readSections(dir, SECTION_SCHEMA);
    assert.deepEqual(sections, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /does not exist/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
  try {
    const { sections, errors } = readSections(dir, SECTION_SCHEMA);
    assert.deepEqual(sections.map((s) => s.slug), ["item-header"]);
    assert.equal(errors.length, 4, errors.join("\n"));
    assert.ok(errors.some((e) => /wrong-name\.json.*slug/.test(e)));
    assert.ok(errors.some((e) => /scalar\.json.*not a JSON object/.test(e)));
    assert.ok(errors.some((e) => /broken\.json.*invalid JSON/.test(e)));
    assert.ok(errors.some((e) => /norole\.json.*schema errors/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
  try {
    const { sections, errors } = readSections(dir, SECTION_SCHEMA);
    assert.deepEqual(sections, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /nested\.json.*SECTION node.*flat/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
  try {
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
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

const { inlineSections } = require("../scripts/app-context/derive-recipes");

const SECTIONS = {
  "control-bar": {
    slug: "control-bar",
    skeleton: {
      content: [
        { type: "FRAME", name: "Results header", children: [] },
        { type: "FRAME", name: "Bulk action bar", children: [] },
      ],
    },
  },
  "item-header": {
    slug: "item-header",
    skeleton: { content: [{ type: "FRAME", name: "Item header", children: [] }] },
  },
};

test("inlineSections splices a section's content in place and records the order", () => {
  const recipe = {
    slug: "r",
    skeleton: {
      chrome: "standard",
      content: [
        {
          type: "FRAME",
          name: "Layout",
          children: [
            { type: "SECTION", section: "item-header" },
            { type: "DIVIDER" },
            {
              type: "FRAME",
              name: "Results pane",
              children: [{ type: "SECTION", section: "control-bar" }, { type: "TEXT", content: "x" }],
            },
          ],
        },
      ],
    },
  };
  const { recipe: out, errors } = inlineSections(recipe, SECTIONS);
  assert.deepEqual(errors, []);
  assert.deepEqual(out.sections, ["item-header", "control-bar"]);
  const layout = out.skeleton.content[0];
  assert.deepEqual(layout.children.map((c) => c.name || c.type), ["Item header", "DIVIDER", "Results pane"]);
  assert.deepEqual(
    layout.children[2].children.map((c) => c.name || c.type),
    ["Results header", "Bulk action bar", "TEXT"],
  );
  // No SECTION node survives, and the input is untouched.
  assert.equal(JSON.stringify(out).includes('"SECTION"'), false);
  assert.equal(recipe.skeleton.content[0].children[0].type, "SECTION");
  // Deep clone: mutating the output does not reach the section.
  layout.children[0].name = "mutated";
  assert.equal(SECTIONS["item-header"].skeleton.content[0].name, "Item header");
});

test("inlineSections: a section referenced twice is spliced at both occurrences but stamped once, first-occurrence order", () => {
  const recipe = {
    slug: "r",
    skeleton: {
      content: [
        { type: "SECTION", section: "item-header" },
        { type: "DIVIDER" },
        { type: "SECTION", section: "item-header" },
      ],
    },
  };
  const { recipe: out, errors } = inlineSections(recipe, SECTIONS);
  assert.deepEqual(errors, []);
  assert.deepEqual(out.sections, ["item-header"]);
  assert.deepEqual(
    out.skeleton.content.map((c) => c.name || c.type),
    ["Item header", "DIVIDER", "Item header"],
  );
});

test("inlineSections: a recipe with no SECTION node gets sections: []", () => {
  const { recipe: out, errors } = inlineSections(
    { slug: "r", skeleton: { content: [{ type: "TEXT", content: "x" }] } },
    SECTIONS,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(out.sections, []);
});

test("inlineSections: unknown slug is an error and the node is dropped", () => {
  const { recipe: out, errors } = inlineSections(
    { slug: "r", skeleton: { content: [{ type: "SECTION", section: "ghost" }] } },
    SECTIONS,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /recipes\/r\.json: unknown section 'ghost'/);
  assert.deepEqual(out.skeleton.content, []);
});

test("inlineSections: a SECTION node carrying keys other than type and section is an error, and the node is dropped", () => {
  const { recipe: out, errors } = inlineSections(
    {
      slug: "r",
      skeleton: { content: [{ type: "SECTION", section: "item-header", variant: "compact" }] },
    },
    SECTIONS,
  );
  assert.equal(errors.length, 1);
  assert.match(
    errors[0],
    /recipes\/r\.json: SECTION node at skeleton\/content\/0 carries keys other than type and section \(variant\); per-use overrides are not a thing, edit the section/,
  );
  assert.deepEqual(out.skeleton.content, []);
});

test("inlineSections: a SECTION object outside a content/children array is an error", () => {
  const { errors } = inlineSections(
    { slug: "r", skeleton: { content: [], appHeader: { type: "SECTION", section: "item-header" } } },
    SECTIONS,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /recipes\/r\.json: SECTION node at skeleton\/appHeader is not an element of content\[\] or children\[\]/);
});

test("inlineSections: the returned recipe shares no object reference with the input", () => {
  const recipe = {
    slug: "r",
    derivedFrom: { surface: "x", capturedOn: "2026-08-18" },
    slots: { a: "b" },
    skeleton: { content: [{ type: "SECTION", section: "item-header" }] },
  };
  const { recipe: out } = inlineSections(recipe, SECTIONS);
  assert.notEqual(out.derivedFrom, recipe.derivedFrom);
  assert.notEqual(out.slots, recipe.slots);
  out.derivedFrom.surface = "mutated";
  assert.equal(recipe.derivedFrom.surface, "x");
});

const SRC_SECTIONS = path.join(ROOT, "app-context", "src", "sections");
const DIST_SECTIONS = path.join(ROOT, "app-context", "dist", "sections");
const DIST_RECIPES = path.join(ROOT, "app-context", "dist", "recipes");

function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
}

test("every authored section has a dist leaf and vice versa", () => {
  assert.ok(fs.existsSync(SRC_SECTIONS), "app-context/src/sections must exist (it may hold only a README)");
  assert.deepEqual(
    jsonFiles(DIST_SECTIONS),
    jsonFiles(SRC_SECTIONS),
    "run npm run derive:app-context",
  );
});

// Modelled on app-context-recipes.test.js's "every dist recipe is
// schema-valid, stamped, and named by its slug": the recipe test walks
// app-context/dist/recipes, this one walks app-context/dist/sections. Without
// it a dist section leaf could drift from the schema (a hand edit, a stale
// derive) with nothing catching it, the way the recipe leaves already are.
test("every dist section is schema-valid, stamped, and named by its slug", () => {
  const ajv = new Ajv({ strict: false, allowUnionTypes: true });
  const v = ajv.compile(SECTION_SCHEMA);
  const files = jsonFiles(DIST_SECTIONS);
  assert.ok(files.length > 0, "no dist sections to check");

  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(DIST_SECTIONS, f), "utf8"));
    assert.equal(doc.slug + ".json", f, f + ": slug must equal filename");
    assert.ok(doc._meta, f + ": missing _meta stamp");
    // _meta is added by the derive and is not part of the authored schema
    const authored = Object.assign({}, doc);
    delete authored._meta;
    assert.ok(v(authored), f + ": " + JSON.stringify(v.errors));
  }
});

// A section's `ds` slug is a Figma-side claim only: this checks it against
// the DS kit registry, which is a record of what exists in the Figma
// library, not against a built renderer leaf. Passing here proves the
// component exists in Figma, not that any consumer (plugin, editor) has
// shipped code for it. Test-side on purpose (not a derive error): a Figma
// rename must not redden an unrelated PR by failing the derive.
test("every `ds` slug in a section INSTANCE resolves in the DS kit registry", () => {
  const dskit = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "components", "dist", "registries", "dskit.json"),
      "utf8",
    ),
  );
  const known = new Set(Object.keys(dskit.components || {}));
  assert.ok(
    known.size > 100,
    "read only " + known.size + " DS kit components; this check would be near-vacuous",
  );

  const { sections, errors } = readSections(path.join(ROOT, "app-context", "src"), SECTION_SCHEMA);
  assert.deepEqual(errors, []);
  assert.ok(sections.length > 0, "no sections read; this check would be vacuous");

  const bad = [];
  for (const s of sections) {
    (function walk(v) {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== "object") return;
      if (v.type === "INSTANCE" && v.ds && !known.has(v.ds)) {
        bad.push(s.slug + ": ds '" + v.ds + "' (ref " + v.ref + ")");
      }
      Object.values(v).forEach(walk);
    })(s.skeleton.content);
  }
  assert.deepEqual(
    bad,
    [],
    "these ds slugs have no entry in components/dist/registries/dskit.json, so the Figma " +
      "component this proves exists does not: " + bad.join("; "),
  );
});

test("no dist recipe holds a SECTION node, and its sections stamp matches its source", () => {
  const { readRecipes } = require("../scripts/app-context/derive-recipes");
  const { recipes, errors } = readRecipes(path.join(ROOT, "app-context", "src"), RECIPE_SCHEMA);
  assert.deepEqual(errors, []);
  assert.ok(recipes.length > 0);
  for (const r of recipes) {
    const dist = JSON.parse(fs.readFileSync(path.join(DIST_RECIPES, r.slug + ".json"), "utf8"));
    assert.equal(JSON.stringify(dist.skeleton).includes('"SECTION"'), false, r.slug + ": dist still holds a SECTION node");
    const referenced = [];
    (function walk(v) {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== "object") return;
      if (v.type === "SECTION") referenced.push(v.section);
      Object.values(v).forEach(walk);
    })(r.skeleton);
    assert.deepEqual(dist.sections, referenced, r.slug + ": sections stamp must list the source's references in order");
    for (const slug of referenced) {
      assert.ok(fs.existsSync(path.join(DIST_SECTIONS, slug + ".json")), r.slug + " references " + slug + " which has no dist leaf");
    }
  }
});

test("paths-manifest declares the two section collections in the metadata zone", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "paths-manifest.json"), "utf8"));
  assert.equal(manifest.collections.appContextSections.dir, "app-context/dist/sections");
  assert.equal(manifest.collections.appContextSections.pattern, "{slug}.json");
  assert.equal(manifest.collections.appContextSectionsSrc.dir, "app-context/src/sections");
  assert.ok(manifest._zones.metadata.includes("appContextSections"));
  assert.ok(manifest._zones.metadata.includes("appContextSectionsSrc"));
});

test("every INSTANCE in a section carries a ds slug, or the section's renderNotes say why not", () => {
  const { sections, errors } = readSections(path.join(ROOT, "app-context", "src"), SECTION_SCHEMA);
  assert.deepEqual(errors, []);
  assert.ok(sections.length >= 6, "expected the six sections");
  let instances = 0;
  for (const s of sections) {
    (function walk(v) {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== "object") return;
      if (v.type === "INSTANCE") {
        instances++;
        if (!v.ds) {
          const excused = (s.renderNotes || []).some((n) => n.includes("`" + v.ref + "`") && /no DS/i.test(n));
          assert.ok(excused, s.slug + ": INSTANCE " + v.ref + " has no ds slug and no renderNote saying there is no DS leaf for it");
        } else {
          assert.match(v.ds, /^[a-z][a-z0-9-]*$/, s.slug + ": ds must be a slug");
        }
      }
      Object.values(v).forEach(walk);
    })(s.skeleton.content);
  }
  assert.ok(instances > 20, "walked only " + instances + " instances; the check is not reaching the sections");
});
