"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var execFileSync = require("node:child_process").execFileSync;

var ROOT = path.resolve(__dirname, "..");
var MAP = path.join(
  ROOT,
  "components",
  "render",
  "renderer",
  "html-renderers",
  "ds-html-map.js",
);
var GENERATED = path.join(
  ROOT,
  "components",
  "render",
  "renderer",
  "html-renderers",
  "ds-retired-slugs.js",
);
var GENERATOR = path.join(ROOT, "scripts", "render", "derive-retired-slugs.js");
var LEDGER = path.join(ROOT, "components", "dist", "identity.json");

var dsMap = require(MAP);
var retired = require(GENERATED).RETIRED_SLUGS;

// A slug is a NAME, not an identity. Figma renames components, the identity
// ledger records it, and until now every consumer that had authored the old
// name broke on the refresh that carried the rename: the v0.34.156 refresh took
// out 37 tests in the plugin across goldens, worked examples, an fm map and two
// allowlists, for three renames. Each consumer then repaired its own copy of a
// fact this repo owns.
//
// The renderer is the ONE place every consumer's slug passes through, and this
// repo owns the ledger, so the resolution lives here for all of them.

function rootClass(html) {
  var m = /^<[a-z]+[^>]*\bclass="([^"]*)"/.exec(html || "");
  return m ? m[1] : "";
}
function isChip(html) {
  return /^<span class="ds-component"/.test(html || "");
}

test("the ledger has at least one rename, or these assertions prove nothing", function () {
  assert.ok(
    Object.keys(retired).length > 0,
    "no retired slugs in the derived map, so every case below would pass vacuously",
  );
});

test("a retired slug renders exactly what its current name renders", function () {
  Object.keys(retired).forEach(function (was) {
    var is = retired[was];
    var underOldName = dsMap.renderDSComponent({ dsSlug: was });
    var underNewName = dsMap.renderDSComponent({ dsSlug: is });
    assert.equal(
      underOldName,
      underNewName,
      was + " must render as " + is + ", it is the same component",
    );
  });
});

test("the assemble-time collectors key by the RESOLVED slug, as the renderer looks up", function () {
  // renderDSComponent is NOT the only place a slug is keyed. ds-anatomy-map's
  // collectDsSlugs feeds buildDsAnatomyDocMap, and collectDsSlugVariants gates
  // on isDelegated(); the renderer then looks both maps up under the RESOLVED
  // slug. While the collectors keyed by the AUTHORED one, a renamed
  // anatomy-delegated component got no doc and no variant style: it chipped, or
  // painted the wrong colours, with nothing red to say so. That path covers 124
  // anatomy-delegated slugs against 60 in the switch, i.e. most of the surface.
  //
  // Driven with a SYNTHETIC rename through window.dsRetiredSlugs, because every
  // entry in the real ledger today happens to be a BUILT_SLUGS switch case, so
  // the committed ledger cannot exercise this at all: a test using it would
  // pass whichever slug the collectors keyed by.
  var hadWindow = "window" in global;
  var prevWindow = global.window;
  var MAPMOD = require.resolve(MAP);
  var ANATOMY = require.resolve(
    path.join(ROOT, "components", "render", "renderer", "ds-anatomy-map.js"),
  );
  delete require.cache[MAPMOD];
  delete require.cache[ANATOMY];
  try {
    global.window = {
      dsRetiredSlugs: { RETIRED_SLUGS: { "old-tag": "tag-read-only" } },
    };
    var anatomy = require(ANATOMY);
    var authored = {
      screens: [{ content: [{ dsSlug: "old-tag", variant: "Type=Shared" }] }],
    };
    assert.deepEqual(
      anatomy.collectDsSlugs(authored),
      ["tag-read-only"],
      "the doc map must be keyed by the slug the renderer will look up",
    );
    assert.deepEqual(
      anatomy.collectDsSlugVariants(authored),
      [{ slug: "tag-read-only", variant: { Type: "Shared" } }],
      "a renamed delegated component must still be collected for its variant style",
    );
  } finally {
    if (hadWindow) global.window = prevWindow;
    else delete global.window;
    delete require.cache[MAPMOD];
    delete require.cache[ANATOMY];
  }
});

test("a current slug is untouched by the resolution", function () {
  // The map holds only retired names and buildRenameIndex guarantees a retired
  // name is never also a current one, so resolution cannot shadow a live slug.
  Object.values(retired).forEach(function (is) {
    assert.equal(
      retired[is],
      undefined,
      is + " is a CURRENT slug and must not itself be a key in the map",
    );
  });
});

test("a DELETED slug still renders a chip, under its own name", function () {
  // A deletion is not a rename: there is no successor to resolve to, and a chip
  // is the honest answer. It must keep the authored name, so a reader can see
  // WHICH component went missing.
  var html = dsMap.renderDSComponent({ dsSlug: "chat-with-ai-steward" });
  assert.ok(isChip(html), "a deleted component renders a chip");
  assert.match(
    html,
    /data-slug="chat-with-ai-steward"/,
    "the chip names the slug that was authored, not a resolved one",
  );
});

test("an unknown slug is unaffected", function () {
  var html = dsMap.renderDSComponent({ dsSlug: "never-existed-anywhere" });
  assert.ok(isChip(html));
  assert.match(html, /data-slug="never-existed-anywhere"/);
});

test("the resolution reads the LEDGER, not a hand-kept list", function () {
  // The whole point. If this map were authored by hand it would be the same
  // defect one layer along, so the generated file must equal what the generator
  // produces from the committed ledger, and the generator must read the
  // substrate's own reader.
  var src = fs.readFileSync(GENERATOR, "utf8");
  assert.match(
    src,
    /buildRenameIndex/,
    "the generator must resolve through the substrate's own ledger reader",
  );
  assert.match(
    fs.readFileSync(GENERATED, "utf8"),
    /AUTO-GENERATED - DO NOT EDIT/,
    "the generated module must say it is generated",
  );
});

test("DRIFT: the committed map is what the generator emits from the committed ledger", function () {
  // Regenerate into a scratch copy of the tree and compare. Confined: the
  // generator writes to a path derived from its own location, so it is driven
  // through a temp ROOT rather than being allowed to write into the repo.
  // Confined for real. The generator derives its OUT from its own __dirname, so
  // running it with cwd=ROOT overwrote the committed file and then relied on a
  // restore path to put it back. `npm test` runs files concurrently, so during
  // that window another file requiring ds-html-map.js could load a map that was
  // never committed, and an interrupt between write and restore left the tree
  // mutated. A test that drives a producer must not be able to touch the repo.
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "retired-drift-"));
  try {
    fs.mkdirSync(path.join(dir, "scripts", "render"), { recursive: true });
    fs.mkdirSync(path.join(dir, "clients"), { recursive: true });
    fs.mkdirSync(path.join(dir, "components", "dist"), { recursive: true });
    fs.mkdirSync(
      path.join(dir, "components", "render", "renderer", "html-renderers"),
      { recursive: true },
    );
    fs.copyFileSync(
      GENERATOR,
      path.join(dir, "scripts", "render", path.basename(GENERATOR)),
    );
    fs.copyFileSync(
      path.join(ROOT, "clients", "resolve-paths.js"),
      path.join(dir, "clients", "resolve-paths.js"),
    );
    fs.copyFileSync(LEDGER, path.join(dir, "components", "dist", "identity.json"));
    execFileSync(
      process.execPath,
      [path.join(dir, "scripts", "render", path.basename(GENERATOR))],
      { cwd: dir, stdio: "pipe" },
    );
    var fresh = fs.readFileSync(
      path.join(dir, "components", "render", "renderer", "html-renderers", "ds-retired-slugs.js"),
      "utf8",
    );
    assert.equal(
      fs.readFileSync(GENERATED, "utf8"),
      fresh,
      "ds-retired-slugs.js is stale against components/dist/identity.json. " +
        "Run `node scripts/render/derive-retired-slugs.js` and commit the result.",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the generator refuses rather than emitting an empty map when the ledger is missing", function () {
  // An empty map un-resolves every rename and looks exactly like "no renames
  // yet", so it must never be written by accident. Driven through a temp tree
  // so the real generated file is never touched.
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "retired-"));
  try {
    fs.mkdirSync(path.join(dir, "scripts", "render"), { recursive: true });
    fs.mkdirSync(path.join(dir, "clients"), { recursive: true });
    fs.mkdirSync(
      path.join(dir, "components", "render", "renderer", "html-renderers"),
      { recursive: true },
    );
    fs.copyFileSync(GENERATOR, path.join(dir, "scripts", "render", path.basename(GENERATOR)));
    fs.copyFileSync(
      path.join(ROOT, "clients", "resolve-paths.js"),
      path.join(dir, "clients", "resolve-paths.js"),
    );
    // No components/dist/identity.json in the temp tree.
    assert.throws(
      function () {
        execFileSync(
          process.execPath,
          [path.join(dir, "scripts", "render", path.basename(GENERATOR))],
          { cwd: dir, stdio: "pipe" },
        );
      },
      /no identity ledger at/,
      "a missing ledger must refuse, not write an empty map",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(fs.existsSync(LEDGER), "the real ledger is untouched");
});

test("a slug named after an Object.prototype member does not resolve through the prototype", function () {
  // `map["constructor"]` on a plain object returns Object itself, which is
  // truthy, so a truthiness test resolved the slug to a stringified function
  // and put `function Object() { [native code] }` in the rendered markup.
  // buildRenameIndex already builds null-prototype maps for this reason; the
  // generated module must too, AND the lookup must use hasOwnProperty, because
  // the map can also arrive through window.dsRetiredSlugs as a plain object.
  ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"].forEach(
    function (name) {
      var html = dsMap.renderDSComponent({ dsSlug: name });
      assert.ok(isChip(html), name + " must fall to a chip, it is not a slug");
      assert.match(
        html,
        new RegExp('data-slug="' + name.replace(/[$]/g, "\\$&") + '"'),
        name + " must keep its own name, not a value read off the prototype",
      );
      assert.doesNotMatch(
        html,
        /native code|\[object Object\]/,
        name + " must never put a prototype member in the markup",
      );
    },
  );
});

test("the generated map is null-prototype, as the substrate's own index is", function () {
  assert.equal(
    Object.getPrototypeOf(retired),
    null,
    "a plain object would resolve prototype names for every consumer that reads the map directly",
  );
});

test("a map supplied through window as a PLAIN object still cannot resolve a prototype name", function () {
  // The null-prototype generated map masks the lookup guard, so this drives the
  // OTHER supply path: window.dsRetiredSlugs, which a browser host sets and
  // which is an ordinary object literal. Without hasOwnProperty at the lookup,
  // `RETIRED_SLUGS["constructor"]` is Object itself and the slug becomes a
  // stringified function.
  var hadWindow = "window" in global;
  var prevWindow = global.window;
  delete require.cache[require.resolve(MAP)];
  try {
    global.window = {
      dsRetiredSlugs: { RETIRED_SLUGS: { "old-name": "new-name" } },
    };
    var fresh = require(MAP);
    var html = fresh.renderDSComponent({ dsSlug: "constructor" });
    assert.doesNotMatch(
      html,
      /native code/,
      "a plain-object map must not resolve constructor through the prototype",
    );
    assert.match(html, /data-slug="constructor"/);
    // And the window-supplied map is genuinely in use, or the assertion above
    // would pass for the wrong reason.
    assert.equal(
      fresh.renderDSComponent({ dsSlug: "old-name" }),
      fresh.renderDSComponent({ dsSlug: "new-name" }),
      "the window-supplied map must actually be read",
    );
  } finally {
    if (hadWindow) global.window = prevWindow;
    else delete global.window;
    delete require.cache[require.resolve(MAP)];
  }
});
