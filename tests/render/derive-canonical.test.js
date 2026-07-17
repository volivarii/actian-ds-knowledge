"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");
var D = require("../../scripts/render/derive-canonical.js");

var SRC = path.resolve(__dirname, "../../components/render/src");

test("deriveCanonical: emits button render + a valid CEM declaration", function () {
  var out = D.deriveCanonical(SRC);
  assert.ok(
    out.renders.button.indexOf("@dsCard") >= 0,
    "render passed through with marker",
  );
  assert.equal(out.cem.schemaVersion, "1.0.0");
  var decl = out.cem.modules
    .flatMap(function (m) {
      return m.declarations || [];
    })
    .find(function (d) {
      return d.tagName === "zen-button";
    });
  assert.ok(decl, "zen-button declaration present");
  assert.ok(
    (decl.attributes || []).some(function (a) {
      return a.name === "emphasis";
    }),
    "emphasis attr",
  );
  assert.ok(
    (decl.cssParts || []).some(function (p) {
      return p.name === "label";
    }),
    "label part",
  );
});

test("deriveCanonical: cssProperties are the button's real consumed tokens, all defined", function () {
  var out = D.deriveCanonical(SRC);
  var decl = out.cem.modules
    .flatMap(function (m) {
      return m.declarations || [];
    })
    .find(function (d) {
      return d.tagName === "zen-button";
    });
  var names = (decl.cssProperties || []).map(function (p) {
    return p.name;
  });
  assert.ok(names.length > 0, "some cssProperties scraped");
  assert.ok(
    names.every(function (n) {
      return n.indexOf("--zen-") === 0;
    }),
    "every cssProperty is a --zen-* token",
  );
  // A token the button visibly consumes (primary fill) must be present, and a
  // token it does NOT consume (a random unrelated primitive) must be absent, so
  // the scrape is the button's real surface, not the whole inlined stylesheet.
  assert.ok(
    names.indexOf("--zen-color-bg-emphasis") >= 0,
    "consumes bg-emphasis",
  );
  assert.ok(
    names.indexOf("--zen-color-primary-500") < 0,
    "does not list an unconsumed primitive",
  );
});

test("deriveCanonical: manifest validates against schemas/canonical-render.json", function () {
  var out = D.deriveCanonical(SRC);
  var schema = require("../../schemas/canonical-render.json");
  var ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  var validate = ajv.compile(schema);
  var ok = validate(out.manifest);
  assert.ok(ok, JSON.stringify(validate.errors));
});

test("deriveCanonical: a slug with no COMPONENT_META gets a registry-derived CEM", function () {
  var D = require("../../scripts/render/derive-canonical.js");
  // Build a tiny src dir with a toggle seed captured offline, or reuse a committed seed.
  var out = D.deriveCanonical(SRC); // SRC now contains multiple seeds after Task 4 generation
  var decl = out.cem.modules
    .flatMap(function (m) {
      return m.declarations || [];
    })
    .find(function (d) {
      return d.tagName === "zen-toggle";
    });
  assert.ok(decl, "zen-toggle declaration present");
  assert.ok(
    (decl.attributes || []).length >= 1,
    "attributes derived from the registry",
  );
});

test("deriveCanonical: dual-kit slug takes its variant axes from dskit, not an empty fmkit stand-in", function () {
  // calendar / search / table also exist in fmkit with EMPTY variants. The
  // registry merge must be ds-first-wins (matching the plugin's findComponent),
  // or these components derive a zero-attribute CEM while their rendered card
  // still shows the real dskit variants.
  var out = D.deriveCanonical(SRC);
  var decl = out.cem.modules
    .flatMap(function (m) {
      return m.declarations || [];
    })
    .find(function (d) {
      return d.tagName === "zen-calendar";
    });
  assert.ok(decl, "zen-calendar declaration present");
  var names = (decl.attributes || []).map(function (a) {
    return a.name;
  });
  assert.ok(
    names.indexOf("type") >= 0 && names.indexOf("selection") >= 0,
    "calendar CEM carries dskit's Type + Selection axes, got: " +
      JSON.stringify(names),
  );
});

test("deriveCanonical: splits seeds into one shared css + per-slug fragments", function () {
  var out = D.deriveCanonical(SRC);
  // One shared stylesheet, non-trivial.
  assert.ok(
    typeof out.css === "string" && out.css.length > 100000,
    "css captured",
  );
  // A fragment per render, markup only (no <style>).
  var slugs = out.manifest.renders.map(function (r) {
    return r.slug;
  });
  assert.ok(slugs.indexOf("button") >= 0, "button present");
  slugs.forEach(function (slug) {
    var frag = out.fragments[slug];
    assert.ok(typeof frag === "string", slug + " has a fragment");
    assert.ok(!/<style/i.test(frag), slug + " fragment carries no <style>");
  });
  // The button fragment still carries its render markup.
  assert.match(
    out.fragments.button,
    /ds-button--primary/,
    "button markup in fragment",
  );
  // Manifest points at the fragment file, and names the shared css.
  assert.equal(out.manifest.css, "render.css");
  var btn = out.manifest.renders.find(function (r) {
    return r.slug === "button";
  });
  assert.equal(btn.fragment, "fragments/button.html");
});

test("deriveCanonical: render.css is the shared block, identical to a seed's style", function () {
  var fs = require("node:fs");
  var path = require("node:path");
  var out = D.deriveCanonical(SRC);
  var seed = fs.readFileSync(path.join(SRC, "button.html"), "utf8");
  var seedStyle = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(seed)[1];
  // Slice 2 appends a derived-from-facts appendix (see the "templated slugs are
  // derived" test below) after the captured base, so the captured base itself
  // must still be byte-for-byte identical to the seed's inlined stylesheet, as
  // a verbatim PREFIX of the combined css.
  assert.equal(
    out.css.slice(0, seedStyle.length),
    seedStyle,
    "css's captured base equals the seed's inlined stylesheet byte-for-byte",
  );
});

test("deriveCanonical: captures the page chrome (block 1) as a guarded pageCss", function () {
  var fs = require("node:fs");
  var path = require("node:path");
  var out = D.deriveCanonical(SRC);
  // pageCss is the seeds' SECOND <style> block, sourced by build-bundle instead
  // of a hardcoded copy, and guarded identical across seeds by the derive.
  assert.match(
    out.pageCss,
    /body\s*\{[^}]*margin[^}]*\}/,
    "pageCss carries the standalone-card body chrome",
  );
  var seed = fs.readFileSync(path.join(SRC, "button.html"), "utf8");
  var blocks = seed.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  var secondInner = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(blocks[1])[1];
  assert.equal(
    out.pageCss,
    secondInner,
    "pageCss equals the seed's second style block",
  );
});

test("deriveCanonical: templated slugs are derived, others captured", function () {
  var out = D.deriveCanonical(SRC);
  var bySlug = {};
  out.manifest.renders.forEach(function (r) {
    bySlug[r.slug] = r;
  });
  assert.equal(bySlug["tag-default"].source, "derived");
  assert.equal(bySlug["checkbox"].source, "derived");
  assert.equal(bySlug["button"].source, "captured");
  // derived fragment + css present
  assert.match(out.fragments["tag-default"], /ds-tag ds-tag--pink/);
  assert.match(out.fragments["checkbox"], /ds-checkbox--indeterminate/);
  assert.match(out.css, /\.ds-tag--pink\{/);
  assert.match(out.css, /ds-checkbox--indeterminate .ds-checkbox__box\{/);
});

test("deriveCanonical: render.css base is derived from the relocated ds-base assets, the seed stylesheet is a verbatim prefix of it", function () {
  // Phase 0 (renderer relocation): the shared render.css base is now sourced from
  // components/render/renderer/{ds-fonts,ds-base}.css (+ tokens.css), not from a
  // seed's inlined <style>. Phase 1b-alpha appends tag color variants + the
  // checkbox indeterminate rule to the END of ds-base.css, rules the frozen
  // seeds predate and so do not carry. So the derived base (concat(tokens,
  // fonts, ds-base) in the render read path's order) is no longer byte-equal
  // to the seed stylesheet, but the seed stylesheet must still be a verbatim
  // PREFIX of it (the pre-existing bytes are untouched, only appended to).
  var fs = require("node:fs");
  var path = require("node:path");
  var out = D.deriveCanonical(SRC);
  var marker = "\n\n/* ===== derived-from-facts (slice 2) ===== */";
  var base =
    out.css.indexOf(marker) >= 0
      ? out.css.slice(0, out.css.indexOf(marker))
      : out.css;
  var root = path.resolve(__dirname, "../..");
  var expect =
    fs.readFileSync(path.join(root, "tokens/tokens.css"), "utf8") +
    "\n" +
    fs.readFileSync(
      path.join(root, "components/render/renderer/ds-fonts.css"),
      "utf8",
    ) +
    "\n" +
    fs.readFileSync(
      path.join(root, "components/render/renderer/ds-base.css"),
      "utf8",
    );
  assert.equal(
    base,
    expect,
    "render.css base equals concat(tokens, fonts, ds-base)",
  );
  var seed = fs.readFileSync(path.join(SRC, "button.html"), "utf8");
  var seedStyle = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(seed)[1];
  assert.equal(
    base.indexOf(seedStyle),
    0,
    "the seed stylesheet is a verbatim prefix of the asset-derived base",
  );
  assert.ok(
    base.length > seedStyle.length,
    "the asset-derived base carries the appended phase-1b rules the seed predates",
  );
});

test("ds-base.css carries the tag color variants and checkbox indeterminate rule", function () {
  var fs = require("node:fs");
  var path = require("node:path");
  var base = fs.readFileSync(
    path.resolve(__dirname, "../../components/render/renderer/ds-base.css"),
    "utf8",
  );
  assert.match(base, /\.ds-tag--pink\s*\{/, "tag pink variant rule present");
  assert.match(
    base,
    /\.ds-checkbox--indeterminate\b/,
    "checkbox indeterminate rule present",
  );
});
