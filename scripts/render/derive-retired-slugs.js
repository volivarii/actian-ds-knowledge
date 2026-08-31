#!/usr/bin/env node
"use strict";

// Derive the renderer's retired-slug map from the identity ledger.
//
// WHY THIS EXISTS
//
// The renderer dispatches on a slug (`switch (node.dsSlug)`), and a slug is not
// a stable identity: Figma renames components, and the ledger records that. So
// every consumer that had authored the old name broke on the refresh that
// carried the rename, and each one repaired itself by hand-editing its own copy
// of the fact. On the 2026-08-28 v0.34.156 refresh that was 37 failing tests in
// the plugin across goldens, worked examples, an fm→ds map and two allowlists,
// for three renames.
//
// The renderer is the ONE place every consumer's slug passes through, and this
// repo already owns the ledger that resolves it, so the resolution belongs
// here: authored content may keep naming the retired slug and still render.
//
// It is a generated MODULE rather than a hand-kept list for the obvious reason:
// a hand-kept list of renames would be the same defect one layer along.
//
// It is a module rather than a read of identity.json because ds-html-map.js is
// UMD and runs in the browser as well as Node, where there is no fs. It is
// picked up through the same `window.X || require("./x")` idiom the renderer
// already uses for fm-html-map.

var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..", "..");
var LEDGER = path.join(ROOT, "components", "dist", "identity.json");
var OUT = path.join(
  ROOT,
  "components",
  "render",
  "renderer",
  "html-renderers",
  "ds-retired-slugs.js",
);

// The substrate's own reader, so this derive and every consumer resolve a
// rename the same way rather than by two implementations that may drift.
var buildRenameIndex = require(
  path.join(ROOT, "clients", "resolve-paths.js"),
).buildRenameIndex;

function main() {
  if (!fs.existsSync(LEDGER)) {
    // Fail loudly: writing an empty map would silently un-resolve every rename
    // and look exactly like "no renames yet".
    throw new Error(
      "no identity ledger at " +
        LEDGER +
        ", so the retired-slug map cannot be derived. Refusing to write an empty one.",
    );
  }
  var ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  var index = buildRenameIndex(ledger);
  var retired = Object.keys(index).sort();

  var body =
    "// AUTO-GENERATED - DO NOT EDIT.\n" +
    "// Source: components/dist/identity.json\n" +
    "// Regenerate: node scripts/render/derive-retired-slugs.js\n" +
    "//\n" +
    "// Retired slug -> the slug that component answers to now, read from the\n" +
    "// identity ledger. ds-html-map.js resolves through this at its single entry\n" +
    "// point, so content authored against a retired name still renders.\n" +
    "//\n" +
    "// A slug is absent here when the ledger cannot say unambiguously what it\n" +
    "// became: two identities claiming one retired name are dropped rather than\n" +
    "// guessed at (see buildRenameIndex). A component that was DELETED rather\n" +
    "// than renamed is also absent, and must be: it has no successor to resolve\n" +
    "// to, and rendering it as a chip is the honest answer.\n" +
    "\n" +
    "(function (exports) {\n" +
    '  "use strict";\n' +
    // Null-prototype, exactly as buildRenameIndex builds it: a slug colliding
    // with a name on Object.prototype ("constructor", "toString") would
    // otherwise resolve THROUGH the prototype, and `map["constructor"]` returns
    // Object itself, which is truthy, so the slug became a stringified
    // function and that reached the rendered HTML.
    //
    // Built by bracket assignment rather than an object literal because
    // `{"__proto__": "x"}` is the prototype SETTER, not a property: a component
    // retired under that literal name would have vanished from the map with
    // nothing to say so, and the drift test would have agreed with itself.
    "  var m = Object.create(null);\n" +
    retired
      .map(function (was) {
        return (
          "  m[" +
          JSON.stringify(was) +
          "] = " +
          JSON.stringify(index[was]) +
          ";"
        );
      })
      .join("\n") +
    (retired.length ? "\n" : "") +
    "  exports.RETIRED_SLUGS = m;\n" +
    "})(\n" +
    '  typeof module !== "undefined"\n' +
    "    ? module.exports\n" +
    "    : (window.dsRetiredSlugs = window.dsRetiredSlugs || {}),\n" +
    ");\n";

  fs.writeFileSync(OUT, body);

  // Positive control on the emission itself. A key the emitted form silently
  // drops (see __proto__ above) would leave a rename unresolved with every
  // check green, including the drift test, which only compares this output
  // against itself.
  delete require.cache[require.resolve(OUT)];
  var emitted = require(OUT).RETIRED_SLUGS;
  var missing = retired.filter(function (was) {
    return emitted[was] !== index[was];
  });
  if (missing.length) {
    throw new Error(
      "the emitted map lost " +
        missing.length +
        " entr(ies) that the ledger has: " +
        missing.join(", ") +
        ". The emission dropped them silently.",
    );
  }
  process.stdout.write(
    "derive-retired-slugs: wrote " +
      path.relative(ROOT, OUT) +
      " with " +
      retired.length +
      " retired slug(s)" +
      (retired.length ? ": " + retired.join(", ") : "") +
      "\n",
  );
}

if (require.main === module) main();
// Declared AND exported so tests/render/derive-contract.test.js asserts a
// workflow actually watches this input. The comment in render-derive.yml
// explaining why the ledger matters is prose; this is the gate. That test finds
// this module by reading scripts/render/ for any file declaring INPUTS, so
// there is nothing to register, and it fails a module that declares INPUTS
// without exporting them, because nothing can assert what it cannot read.
var INPUTS = ["components/dist/identity.json"];

module.exports = { main: main, OUT: OUT, LEDGER: LEDGER, INPUTS: INPUTS };
