"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Ajv = require("ajv/dist/2020");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "app-context", "src", "recipes");
const DIST = path.join(ROOT, "app-context", "dist", "recipes");
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(ROOT, "schemas", "app-context-recipe.json"), "utf8"),
);
const { readRecipes, checkReferences } = require("../scripts/app-context/derive-recipes");

function distFiles() {
  if (!fs.existsSync(DIST)) return [];
  return fs.readdirSync(DIST).filter((f) => f.endsWith(".json"));
}

// ---------------------------------------------------------------------------
// Non-vacuity. The point of these tests is that a recipe REACHES dist. If the
// derive silently emitted nothing, every per-file assertion below would pass
// over an empty list and report green. This asserts the subject exists first.
// ---------------------------------------------------------------------------

test("the derive emitted at least one recipe to dist", () => {
  const authored = fs.existsSync(SRC)
    ? fs.readdirSync(SRC).filter((f) => f.endsWith(".json"))
    : [];
  assert.ok(authored.length > 0, "no recipes authored in app-context/src/recipes");
  assert.equal(
    distFiles().length,
    authored.length,
    "every authored recipe must have a dist leaf; run npm run derive:app-context",
  );
});

test("positive control: the emit count CAN be zero, so the check above is not tautological", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recipes-control-"));
  fs.mkdirSync(path.join(tmp, "recipes"));
  const { recipes, errors } = readRecipes(tmp, SCHEMA);
  assert.equal(errors.length, 0, "an empty source dir is not an error");
  assert.equal(
    recipes.length,
    0,
    "an empty source dir must yield zero recipes; if this is non-zero the reader is not reading the dir it is given",
  );
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const VALID = {
  _schema_version: 1,
  slug: "example-shape",
  label: "Example shape",
  description: "A page shape used to exercise the schema.",
  apps: ["studio"],
  derivedFrom: { surface: "Studio > Catalog", capturedOn: "2026-08-18" },
  skeleton: { chrome: "standard", content: [] },
};

test("recipe schema accepts a valid record and rejects malformed ones", () => {
  const ajv = new Ajv({ strict: false, allowUnionTypes: true });
  const v = ajv.compile(SCHEMA);

  assert.ok(v(VALID), JSON.stringify(v.errors));

  // provenance is required: a recipe never compared against the product is a guess
  const noProvenance = Object.assign({}, VALID);
  delete noProvenance.derivedFrom;
  assert.equal(v(noProvenance), false, "derivedFrom must be required");

  // a capture date that is not a date would age the recipe dishonestly
  assert.equal(
    v(Object.assign({}, VALID, { derivedFrom: { surface: "x", capturedOn: "last week" } })),
    false,
    "capturedOn must be an ISO date",
  );

  assert.equal(
    v(Object.assign({}, VALID, { slug: "Not A Slug" })),
    false,
    "slug must be kebab-case",
  );
  assert.equal(v(Object.assign({}, VALID, { apps: [] })), false, "apps must be non-empty");
});

// ---------------------------------------------------------------------------
// Every emitted recipe is well formed and its references resolve
// ---------------------------------------------------------------------------

test("every dist recipe is schema-valid, stamped, and named by its slug", () => {
  const ajv = new Ajv({ strict: false, allowUnionTypes: true });
  const v = ajv.compile(SCHEMA);
  const files = distFiles();
  assert.ok(files.length > 0, "no dist recipes to check");

  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(DIST, f), "utf8"));
    assert.equal(doc.slug + ".json", f, f + ": slug must equal filename");
    assert.ok(doc._meta, f + ": missing _meta stamp");
    // _meta is added by the derive and is not part of the authored schema
    const authored = Object.assign({}, doc);
    delete authored._meta;
    assert.ok(v(authored), f + ": " + JSON.stringify(v.errors));
  }
});

test("recipe app and pattern references resolve against app-context", () => {
  const appContext = JSON.parse(
    fs.readFileSync(path.join(ROOT, "app-context", "dist", "app-context.json"), "utf8"),
  );
  const { recipes } = readRecipes(path.join(ROOT, "app-context", "src"), SCHEMA);
  assert.ok(recipes.length > 0, "no recipes read from src");
  assert.deepEqual(checkReferences(recipes, appContext), []);
});

test("positive control: an unknown pattern reference is caught", () => {
  const appContext = JSON.parse(
    fs.readFileSync(path.join(ROOT, "app-context", "dist", "app-context.json"), "utf8"),
  );
  const errs = checkReferences(
    [{ slug: "bogus", apps: ["studio"], patterns: ["no-such-pattern"] }],
    appContext,
  );
  assert.equal(errs.length, 1, "reference check must reject an unknown pattern");
  assert.match(errs[0], /unknown pattern/);
});

// ---------------------------------------------------------------------------
// Layout correctness: axis-blind FILL.
//
// `render-node.js` emits `flex:1` for sizing.horizontal === "FILL" with no
// awareness of the parent's direction, so inside a VERTICAL frame it
// distributes HEIGHT rather than setting width. Width already fills there:
// the renderer only writes `align-items` when `counterAxisAlignItems` is
// given, so flexbox's `stretch` default applies. FILL is therefore never
// right for a child of a VERTICAL frame, and faceted-browse carried 20 of
// them (plugin #298). This gate is the reason the next recipe cannot.
// ---------------------------------------------------------------------------

function axisBlindFills(skeleton) {
  const bad = [];
  (function walk(node, parentMode) {
    if (Array.isArray(node)) {
      for (const n of node) walk(n, parentMode);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (parentMode === "VERTICAL" && (node.sizing || {}).horizontal === "FILL") {
      bad.push(node.name || node.ref || node.type);
    }
    const mode = (node.layout || {}).mode;
    for (const child of node.children || []) walk(child, mode);
  })(skeleton.content, null);
  return bad;
}

test("no recipe sets sizing.horizontal FILL inside a VERTICAL frame", () => {
  const { recipes } = readRecipes(path.join(ROOT, "app-context", "src"), SCHEMA);
  assert.ok(recipes.length > 0, "no recipes read; this check would be vacuous");
  let framesChecked = 0;
  for (const r of recipes) {
    (function count(node, parentMode) {
      if (Array.isArray(node)) {
        for (const n of node) count(n, parentMode);
        return;
      }
      if (!node || typeof node !== "object") return;
      if (parentMode === "VERTICAL") framesChecked += 1;
      const mode = (node.layout || {}).mode;
      for (const child of node.children || []) count(child, mode);
    })(r.skeleton.content, null);
    assert.deepEqual(
      axisBlindFills(r.skeleton),
      [],
      r.slug + ": these are children of a VERTICAL frame and must omit sizing.horizontal",
    );
  }
  // Non-vacuity: the walk must actually have descended into vertical frames.
  assert.ok(
    framesChecked > 20,
    "walked only " + framesChecked + " children of VERTICAL frames; the check is not reaching the tree",
  );
});

test("positive control: the axis-blind FILL check does catch one", () => {
  const planted = {
    content: [
      {
        type: "FRAME",
        layout: { mode: "VERTICAL" },
        children: [
          { type: "FRAME", name: "PLANTED", sizing: { horizontal: "FILL" }, children: [] },
          { type: "FRAME", name: "fine-in-a-row", layout: { mode: "HORIZONTAL" },
            children: [{ type: "FRAME", name: "legit", sizing: { horizontal: "FILL" }, children: [] }] },
        ],
      },
    ],
  };
  assert.deepEqual(
    axisBlindFills(planted),
    ["PLANTED"],
    "must flag the vertical-parent case and must NOT flag the horizontal-parent one",
  );
});
