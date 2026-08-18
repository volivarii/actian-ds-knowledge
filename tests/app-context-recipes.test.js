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
  fs.readFileSync(
    path.join(ROOT, "schemas", "app-context-recipe.json"),
    "utf8",
  ),
);
const {
  readRecipes,
  checkReferences,
} = require("../scripts/app-context/derive-recipes");

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
  assert.ok(
    authored.length > 0,
    "no recipes authored in app-context/src/recipes",
  );
  // Set equality, not count equality: {a,b} src against {a,c} dist (a stale
  // hand-committed leaf plus a missing one) satisfies a count comparison.
  assert.deepEqual(
    distFiles().sort(),
    authored.sort(),
    "every authored recipe must have a dist leaf and vice versa; run npm run derive:app-context",
  );
});

test("positive control: the emit count CAN be zero, so the check above is not tautological", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recipes-control-"));
  fs.mkdirSync(path.join(tmp, "recipes"));
  const { recipes, errors } = readRecipes(tmp, SCHEMA);
  // An EMPTY dir is fine (nothing to prune against, nothing authored); an
  // ABSENT one is not, and is asserted separately below.
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
    v(
      Object.assign({}, VALID, {
        derivedFrom: { surface: "x", capturedOn: "last week" },
      }),
    ),
    false,
    "capturedOn must be an ISO date",
  );

  assert.equal(
    v(Object.assign({}, VALID, { slug: "Not A Slug" })),
    false,
    "slug must be kebab-case",
  );
  assert.equal(
    v(Object.assign({}, VALID, { apps: [] })),
    false,
    "apps must be non-empty",
  );
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
    fs.readFileSync(
      path.join(ROOT, "app-context", "dist", "app-context.json"),
      "utf8",
    ),
  );
  const { recipes } = readRecipes(
    path.join(ROOT, "app-context", "src"),
    SCHEMA,
  );
  assert.ok(recipes.length > 0, "no recipes read from src");
  assert.deepEqual(checkReferences(recipes, appContext), []);
});

test("positive control: an unknown pattern reference is caught", () => {
  const appContext = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "app-context", "dist", "app-context.json"),
      "utf8",
    ),
  );
  const errs = checkReferences(
    [{ slug: "bogus", apps: ["studio"], patterns: ["no-such-pattern"] }],
    appContext,
  );
  assert.equal(
    errs.length,
    1,
    "reference check must reject an unknown pattern",
  );
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

// Traverses EVERY value under `skeleton`, not just `children` under a hardcoded
// `content` key. `skeleton` is deliberately schema-unconstrained ("node-level
// shape is owned by the consuming renderer"), so a recipe rooted at any other
// key was previously walked as `undefined` and reported nothing at all.
// `parentMode` is carried only into a frame's own `children`; anywhere else the
// parent's direction is unknown, so nothing is claimed about it.
function walkNodes(value, parentMode, visit) {
  if (Array.isArray(value)) {
    for (const v of value) walkNodes(v, parentMode, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  visit(value, parentMode);
  const mode = (value.layout || {}).mode;
  for (const [k, v] of Object.entries(value)) {
    if (k === "layout" || k === "sizing") continue;
    walkNodes(v, k === "children" ? mode : null, visit);
  }
}

function axisBlindFills(skeleton) {
  const bad = [];
  walkNodes(skeleton, null, function (node, parentMode) {
    if (
      parentMode === "VERTICAL" &&
      (node.sizing || {}).horizontal === "FILL"
    ) {
      bad.push(node.name || node.ref || node.type);
    }
  });
  return bad;
}

test("no recipe sets sizing.horizontal FILL inside a VERTICAL frame", () => {
  const { recipes } = readRecipes(
    path.join(ROOT, "app-context", "src"),
    SCHEMA,
  );
  assert.ok(recipes.length > 0, "no recipes read; this check would be vacuous");
  const perRecipe = {};
  for (const r of recipes) {
    walkNodes(r.skeleton, null, function (_node, parentMode) {
      if (parentMode === "VERTICAL")
        perRecipe[r.slug] = (perRecipe[r.slug] || 0) + 1;
    });
    assert.deepEqual(
      axisBlindFills(r.skeleton),
      [],
      r.slug +
        ": these are children of a VERTICAL frame and must omit sizing.horizontal",
    );
  }
  // Non-vacuity PER RECIPE. A sum across all recipes hides a NEW one that is
  // walked not at all: the two existing recipes contribute enough on their own
  // to keep any total comfortably green.
  for (const r of recipes) {
    assert.ok(
      (perRecipe[r.slug] || 0) > 5,
      r.slug +
        ": walked only " +
        (perRecipe[r.slug] || 0) +
        " children of VERTICAL frames; the check is not reaching this recipe",
    );
  }
});

test("positive control: the axis-blind FILL check does catch one", () => {
  const planted = {
    content: [
      {
        type: "FRAME",
        layout: { mode: "VERTICAL" },
        children: [
          {
            type: "FRAME",
            name: "PLANTED",
            sizing: { horizontal: "FILL" },
            children: [],
          },
          {
            type: "FRAME",
            name: "fine-in-a-row",
            layout: { mode: "HORIZONTAL" },
            children: [
              {
                type: "FRAME",
                name: "legit",
                sizing: { horizontal: "FILL" },
                children: [],
              },
            ],
          },
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

// ---------------------------------------------------------------------------
// Pattern selection metadata.
//
// `when` exists to point a reader at the neighbouring shape to use instead.
// A pointer to a pattern that has been renamed or retired is worse than no
// pointer, because it reads as authoritative. The phrase this catches is the
// ones the authored `when` texts actually use. A first cut matched only
// lowercase "use <slug>" and guarded 13 of the 15 pointers written, missing
// both of the ones that were in fact broken. Ordinary prose
// ("use a plain form", "use a dropdown") is deliberately not matched, so the
// gate cannot force a neighbour to be invented where none exists.
// ---------------------------------------------------------------------------

const AC = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "app-context", "dist", "app-context.json"),
    "utf8",
  ),
);

function danglingWhenRefs(patterns) {
  const known = new Set(Object.keys(patterns));
  const bad = [];
  for (const [slug, p] of Object.entries(patterns)) {
    if (!p.when) continue;
    const refs =
      String(p.when).match(
        /\b(?:use|that is|prefer)\s+([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/gi,
      ) || [];
    for (const raw of refs) {
      const ref = raw.replace(/^\S+(?:\s+is)?\s+/i, "").toLowerCase();
      if (!known.has(ref)) bad.push(slug + " -> " + ref);
    }
  }
  return bad;
}

test("every pattern named inside a `when` resolves to a pattern that exists", () => {
  const withWhen = Object.values(AC.patterns).filter((p) => p.when);
  assert.ok(
    withWhen.length >= 10,
    "only " +
      withWhen.length +
      " patterns carry `when`; this check would be near-vacuous",
  );
  assert.deepEqual(danglingWhenRefs(AC.patterns), []);
});

test("positive control: a `when` naming a retired pattern is caught", () => {
  const planted = {
    // present, so a reference to it must be accepted
    "search-filtered-table": { label: "Search-filtered list table" },
    "faceted-browse": {
      when: "Do not use search-filtered-table, which has no facet rail.",
    },
    "some-shape": {
      when: "Do not use a plain form. Do not use retired-shape-name either.",
    },
  };
  assert.deepEqual(
    danglingWhenRefs(planted),
    ["some-shape -> retired-shape-name"],
    "must flag the dangling slug, must ignore ordinary prose, must accept the real one",
  );
});

test("tags are absent or plural, never a single word", () => {
  const single = Object.entries(AC.patterns)
    .filter(([, p]) => Array.isArray(p.tags) && p.tags.length === 1)
    .map(([s]) => s);
  // One tag is the coincidence engine this metadata exists to replace: it
  // matches any archetype sharing that word and ranks no better than chance.
  assert.deepEqual(single, [], "these patterns carry exactly one tag");
});

// A `when` is authored as a YAML folded scalar (`>-`), which turns each line
// break into a space. A wrap that lands inside a hyphenated token therefore
// ships `table-with- tabs`: the neighbour pointer is broken on arrival, and the
// dangling-reference gate below never sees it because it no longer looks like a
// slug. Two of these reached main before this existed.
function foldArtifacts(patterns) {
  const bad = [];
  for (const [slug, p] of Object.entries(patterns)) {
    for (const field of ["when", "description"]) {
      const v = p[field];
      if (typeof v !== "string") continue;
      const m = v.match(/[a-z0-9]+- [a-z0-9]/g);
      if (m) bad.push(slug + "." + field + ": " + m.join(", "));
    }
  }
  return bad;
}

test("no authored prose was broken by a folded-scalar line wrap", () => {
  const withWhen = Object.values(AC.patterns).filter((p) => p.when);
  assert.ok(
    withWhen.length >= 10,
    "too few `when` fields for this to mean much",
  );
  assert.deepEqual(foldArtifacts(AC.patterns), []);
});

test("positive control: the fold-artifact check catches a split slug", () => {
  assert.deepEqual(
    foldArtifacts({
      good: {
        when: "Do not use table-with-tabs, which partitions by one axis.",
      },
      bad: { when: "that is table-with- tabs." },
    }),
    ["bad.when: with- t"],
  );
});

// 🚨 A missing source directory must NOT read as "no recipes". readRecipes
// returned an empty list for an absent dir and writeRecipes then pruned every
// dist leaf, so a bad rebase or a sparse checkout deleted the whole derived
// surface while printing "derived app-context recipes: 0" and exiting 0. Same
// silent-success shape as the anatomy prune that removed 179 committed files.
// My own positive control asserted the empty-dir case was fine, which pinned it.
test("an absent source directory is an error, not an instruction to prune", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recipes-nodir-"));
  try {
    const { errors, recipes } = readRecipes(tmp, SCHEMA); // no recipes/ subdir
    assert.equal(recipes.length, 0);
    assert.equal(errors.length, 1, "an absent dir must be reported");
    assert.match(errors[0], /recipes/i);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("a recipe file that parses to a non-object is an error, not a crash", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recipes-nonobj-"));
  try {
    fs.mkdirSync(path.join(tmp, "recipes"));
    fs.writeFileSync(path.join(tmp, "recipes", "broken.json"), "null");
    const { errors } = readRecipes(tmp, SCHEMA);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /broken\.json/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
