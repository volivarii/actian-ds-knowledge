"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");
var D = require("../../scripts/render/derive-canonical.js");
var RENDER_SLUGS =
  require("../../components/render/renderer/matrix.js").RENDER_SLUGS;

test("deriveCanonical: emits a valid CEM declaration for button", function () {
  var out = D.deriveCanonical();
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
  var out = D.deriveCanonical();
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
  // "all defined" above used to be checked only as a --zen- PREFIX, which the
  // title laundered into a resolution claim it never made. The real resolution
  // check now runs over the whole derived output below.
  var defined = D.definedVars(out.css);
  var unresolved = names.filter(function (n) {
    return !defined.has(n);
  });
  assert.deepEqual(
    unresolved,
    [],
    "button cssProperties with no definition in render.css: " +
      JSON.stringify(unresolved),
  );
});

// Restores the invariant the deleted validateSeed asserted over the frozen
// seeds: every --zen-* token a render REFERENCES must actually be DEFINED, or
// the component paints a browser default and nothing reds. Nothing else asserted
// this once validateSeed went, so it is restored here over the DERIVED output
// (render.css plus all fragments) rather than over a frozen capture.
//
// Measured at restore: 66 tokens referenced, 231 defined, 0 unresolved. All 66
// come from render.css; the fragments contribute 0 today, because the renderer
// resolves appearance facts to literal values in its inline styles rather than
// emitting var() references. The fragment arm is therefore forward-looking
// rather than currently load-bearing, and it is deliberately kept: the moment a
// renderer change starts emitting var() into markup, an undefined token there
// would paint a browser default with nothing else reddening.
test("every --zen-* token referenced by render.css or any fragment resolves to a definition", function () {
  var out = D.deriveCanonical();
  var defined = D.definedVars(out.css);
  var slugs = Object.keys(out.fragments);

  var referenced = new Map(); // token -> [sources that reference it]
  function collect(text, source) {
    D.referencedVars(text).forEach(function (token) {
      if (!referenced.has(token)) referenced.set(token, []);
      referenced.get(token).push(source);
    });
  }
  collect(out.css, "render.css");
  slugs.forEach(function (slug) {
    collect(out.fragments[slug], "fragments/" + slug + ".html");
  });

  // Non-vacuity: if referencedVars or the derive ever returned nothing, the
  // resolution assertion below would pass over an empty set and this gate would
  // silently stop protecting anything. Tracks RENDER_SLUGS.length (rather than
  // a hardcoded count) so a slug added to the render matrix is scanned
  // automatically instead of quietly falling outside this gate.
  assert.equal(
    slugs.length,
    RENDER_SLUGS.length,
    "all " + RENDER_SLUGS.length + " fragments were scanned",
  );
  assert.ok(
    referenced.size > 0,
    "no --zen-* references found at all across render.css + " +
      RENDER_SLUGS.length +
      " fragments; referencedVars or the derive is broken, not the tokens",
  );
  assert.ok(defined.size > 0, "no --zen-* definitions found in render.css");

  // Report every unresolved token BY NAME (with where it is referenced from),
  // not just a count: a count tells nobody which token to go define.
  var unresolved = [];
  referenced.forEach(function (sources, token) {
    if (!defined.has(token)) {
      unresolved.push(token + " (referenced by " + sources.join(", ") + ")");
    }
  });
  assert.deepEqual(
    unresolved,
    [],
    "tokens referenced but never defined:\n  " + unresolved.join("\n  "),
  );
});

test("deriveCanonical: manifest validates against schemas/canonical-render.json", function () {
  var out = D.deriveCanonical();
  var schema = require("../../schemas/canonical-render.json");
  var ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  var validate = ajv.compile(schema);
  var ok = validate(out.manifest);
  assert.ok(ok, JSON.stringify(validate.errors));
});

test("deriveCanonical: a slug with no COMPONENT_META gets a registry-derived CEM", function () {
  var D = require("../../scripts/render/derive-canonical.js");
  var out = D.deriveCanonical();
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
  var out = D.deriveCanonical();
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

test("deriveCanonical: splits its output into one shared css + per-slug fragments", function () {
  var out = D.deriveCanonical();
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

test("deriveCanonical: exposes the standalone-card page chrome as pageCss", function () {
  var out = D.deriveCanonical();
  // pageCss is the PAGE_CSS constant the derive owns, sourced by build-bundle
  // instead of build-bundle keeping a hardcoded copy that could drift. It came
  // from the capture harness's second <style> block, measured identical across
  // all 35 seeds at phase 3 and lifted to a constant when they retired, so this
  // now asserts its SHAPE rather than pinning it to a capture that is gone.
  assert.match(
    out.pageCss,
    /body\s*\{[^}]*margin[^}]*\}/,
    "pageCss carries the standalone-card body chrome",
  );
});

test('deriveCanonical: templates retired, no render is source "derived"', function () {
  // Renderer relocation phase 1b-beta emptied TEMPLATES, so the
  // TEMPLATES[slug] override loop in derive-canonical.js never fires (the
  // loop itself is retained as the escape hatch, see the "templates
  // retired" test below for the tag-default/checkbox specifics).
  var out = D.deriveCanonical();
  assert.equal(
    out.manifest.renders.some(function (r) {
      return r.source === "derived";
    }),
    false,
    'no render carries source "derived" now that TEMPLATES is empty',
  );
  var bySlug = {};
  out.manifest.renders.forEach(function (r) {
    bySlug[r.slug] = r;
  });
  assert.equal(bySlug["button"].source, "rendered");
});

test("deriveCanonical: render.css base is exactly concat(tokens, fonts, ds-base) from the relocated assets", function () {
  // Phase 0 (renderer relocation): the shared render.css base is sourced from
  // components/render/renderer/{ds-fonts,ds-base}.css (+ tokens.css), in the
  // order the render read path uses. This is the assertion that keeps the derive
  // honest about WHERE its stylesheet comes from. Phase 0 additionally pinned the
  // result against the frozen seed stylesheet as a verbatim prefix; that half
  // retired with the seeds at phase 3, since it proved the relocated assets
  // matched the historical capture, which is migration safety, and the migration
  // completed and was verified end-to-end at phase 2.
  var fs = require("node:fs");
  var path = require("node:path");
  var out = D.deriveCanonical();
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
  // Non-vacuity: an empty read on all three assets would make the equality above
  // trivially true while shipping a blank stylesheet.
  assert.ok(base.length > 100000, "the asset-derived base is non-trivial");
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

test("templates retired: tag/checkbox derive through the generic renderer, no derived appendix", function () {
  var { deriveCanonical } = require("../../scripts/render/derive-canonical.js");
  var {
    deriveFragment,
  } = require("../../scripts/render/derive-from-renderer.js");
  var out = deriveCanonical();
  ["tag-default", "checkbox"].forEach(function (slug) {
    var r = out.manifest.renders.find(function (x) {
      return x.slug === slug;
    });
    assert.strictEqual(
      r.source,
      "rendered",
      slug + " now renders through the generic renderer",
    );
    assert.strictEqual(
      out.fragments[slug],
      deriveFragment(slug),
      slug + " fragment is the renderer output",
    );
  });
  assert.doesNotMatch(
    out.css,
    /derived-from-facts \(slice 2\)/,
    "no transient derived CSS appendix remains",
  );
});

test("consumedVars: a selector does not absorb a sibling compound-name block's tokens", function () {
  // Regression for the loader / loader-with-logo collision: .ds-foo's negative
  // lookahead used to reject only a following letter/digit, so .ds-foo also
  // matched .ds-foo-bar (a separate compound-name block) and absorbed its
  // tokens. The BEM -- modifier and __ element forms must still match.
  var styleText =
    ".ds-foo { color: var(--zen-color-a); }\n" +
    ".ds-foo-bar { color: var(--zen-color-b); }\n" +
    ".ds-foo--mod { color: var(--zen-color-c); }\n" +
    ".ds-foo__part { color: var(--zen-color-d); }\n";
  var fooVars = D.consumedVars(styleText, "ds-foo");
  assert.ok(
    fooVars.indexOf("--zen-color-a") >= 0,
    "still matches its own base rule",
  );
  assert.ok(
    fooVars.indexOf("--zen-color-b") < 0,
    ".ds-foo must not absorb .ds-foo-bar's token",
  );
  assert.ok(
    fooVars.indexOf("--zen-color-c") >= 0,
    "still matches its own -- modifier rule",
  );
  assert.ok(
    fooVars.indexOf("--zen-color-d") >= 0,
    "still matches its own __ element rule",
  );

  var fooBarVars = D.consumedVars(styleText, "ds-foo-bar");
  assert.deepEqual(
    fooBarVars,
    ["--zen-color-b"],
    ".ds-foo-bar keeps its own token, scanned as its own selector",
  );
});

test("deriveCanonical: loader does not absorb loader-with-logo's tokens (prefix-pair isolation)", function () {
  // loader / loader-with-logo is the real hyphen-prefix slug pair that exposed
  // the collision: both are registry-derived (no COMPONENT_META entry), so
  // their cssSelector falls back to "ds-" + slug, and .ds-loader used to also
  // match .ds-loader-with-logo's rule.
  var out = D.deriveCanonical();
  var decls = out.cem.modules.flatMap(function (m) {
    return m.declarations || [];
  });
  var loader = decls.find(function (d) {
    return d.tagName === "zen-loader";
  });
  var loaderWithLogo = decls.find(function (d) {
    return d.tagName === "zen-loader-with-logo";
  });
  assert.ok(loader, "zen-loader declaration present");
  assert.ok(loaderWithLogo, "zen-loader-with-logo declaration present");

  var loaderNames = (loader.cssProperties || []).map(function (p) {
    return p.name;
  });
  var loaderWithLogoNames = (loaderWithLogo.cssProperties || []).map(
    function (p) {
      return p.name;
    },
  );
  // loader-with-logo genuinely consumes this token: the assertion below is
  // only meaningful if the fixture still exercises the collision surface.
  assert.ok(
    loaderWithLogoNames.indexOf("--zen-spacing-sm") >= 0,
    "loader-with-logo still consumes its own --zen-spacing-sm (fixture sanity)",
  );
  assert.ok(
    loaderNames.indexOf("--zen-spacing-sm") < 0,
    "loader must not absorb loader-with-logo's --zen-spacing-sm: got " +
      JSON.stringify(loaderNames),
  );
});

test("deriveCanonical/consumedVars: the 4 new gray-box-to-zero hyphen-prefix pairs do not cross-absorb tokens", function () {
  // Generalizes the loader/loader-with-logo regression above to the 4 new
  // hyphen-prefix pairs this PR relies on the same consumedVars guard for:
  // notification/notification-dropdown, search/search-dropdown-menu,
  // search/search-result-card, tag-catalog/tag-catalog-item-type.
  var out = D.deriveCanonical();
  var decls = out.cem.modules.flatMap(function (m) {
    return m.declarations || [];
  });
  function namesFor(tagName) {
    var d = decls.find(function (x) {
      return x.tagName === tagName;
    });
    assert.ok(d, tagName + " declaration present");
    return (d.cssProperties || []).map(function (p) {
      return p.name;
    });
  }
  // Mirrors deriveCanonical()'s own cemStyle construction (assetBase with
  // comments stripped) so consumedVars() is exercised exactly as production
  // calls it, not against raw text that could carry an incidental hex/token
  // mention inside a comment.
  var cemStyle = out.css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // search / search-result-card: the textbook case, shaped exactly like
  // loader/loader-with-logo -- both slugs' real CSS classes match their
  // registered name (.ds-search, .ds-search-result-card) and both CEM
  // declarations are genuinely non-empty, so this is checked purely via the
  // real declarations, like the loader test above.
  var searchNames = namesFor("zen-search");
  var searchResultCardNames = namesFor("zen-search-result-card");
  assert.ok(
    searchResultCardNames.indexOf("--zen-border-selected") >= 0,
    "search-result-card still consumes its own --zen-border-selected (fixture sanity)",
  );
  assert.ok(
    searchNames.indexOf("--zen-border-selected") < 0,
    "search must not absorb search-result-card's --zen-border-selected: got " +
      JSON.stringify(searchNames),
  );

  // tag-catalog / tag-catalog-item-type: tag-catalog's real markup uses the
  // BEM modifier .ds-tag--catalog, not .ds-tag-catalog, so a guessed
  // "ds-" + slug selector picked up nothing here. #474 replaced that guess
  // with matrix.js's declared ownership, and tag-catalog is declared to own
  // "ds-tag": the shared tag-family prefix, not a slug-shaped literal, so
  // its declaration is no longer empty by design (it is the family's token
  // surface, same as every other tag-family member). --zen-color-error-800
  // is therefore a bad probe token now: it is legitimately part of that
  // family surface too (.ds-tag--orange .ds-tag-stage__dot), so it can't
  // tell a real absorption from tag-catalog's own intended scope.
  // --zen-color-success-800 is used exactly once in ds-base.css, in
  // .ds-tag-catalog-item-type--field's name color, and nowhere in any real
  // .ds-tag family rule, so it still isolates the guard this test exists
  // for: "ds-tag" is a genuine hyphen-prefix of
  // ".ds-tag-catalog-item-type", and a regressed guard would make
  // tag-catalog's declaration start absorbing tag-catalog-item-type's
  // tokens.
  var tagCatalogItemTypeNames = namesFor("zen-tag-catalog-item-type");
  var tagCatalogNames = namesFor("zen-tag-catalog");
  assert.ok(
    tagCatalogItemTypeNames.indexOf("--zen-color-success-800") >= 0,
    "tag-catalog-item-type still consumes its own --zen-color-success-800 (fixture sanity)",
  );
  assert.ok(
    tagCatalogNames.indexOf("--zen-color-success-800") < 0,
    "tag-catalog must not absorb tag-catalog-item-type's --zen-color-success-800: got " +
      JSON.stringify(tagCatalogNames),
  );

  // notification / notification-dropdown and search / search-dropdown-menu:
  // the SHORTER slug's real class always matches its registered name
  // (.ds-notification, .ds-search), so the collision risk on THAT side is
  // checked via its real CEM declaration, same as above. The LONGER slug's
  // registered class does not equal ds-<slug> here either (notification-
  // dropdown emits .ds-notification-menu, search-dropdown-menu emits
  // .ds-search-menu -- a known CEM-derive undercount for BEM/renamed
  // classes, tracked separately, not this guard), so its own CEM declaration
  // is empty too and cannot serve as the "still consumes its own token"
  // sanity check the way loader-with-logo's declaration does above. That
  // sanity check is done directly against the real compound class instead,
  // via the same consumedVars() the derive itself uses.
  var notificationNames = namesFor("zen-notification");
  var notificationMenuTokens = D.consumedVars(cemStyle, "ds-notification-menu");
  assert.ok(
    notificationMenuTokens.indexOf("--zen-shadow-lg") >= 0,
    "the real .ds-notification-menu block still consumes --zen-shadow-lg (fixture sanity)",
  );
  assert.ok(
    notificationNames.indexOf("--zen-shadow-lg") < 0,
    "notification must not absorb .ds-notification-menu's --zen-shadow-lg: got " +
      JSON.stringify(notificationNames),
  );

  var searchMenuTokens = D.consumedVars(cemStyle, "ds-search-menu");
  assert.ok(
    searchMenuTokens.indexOf("--zen-shadow-lg") >= 0,
    "the real .ds-search-menu block still consumes --zen-shadow-lg (fixture sanity)",
  );
  assert.ok(
    searchNames.indexOf("--zen-shadow-lg") < 0,
    "search must not absorb .ds-search-menu's --zen-shadow-lg: got " +
      JSON.stringify(searchNames),
  );
});

test("derive-canonical sources fragments from the renderer and labels them rendered", function () {
  var { deriveCanonical } = require("../../scripts/render/derive-canonical.js");
  var {
    deriveFragment,
  } = require("../../scripts/render/derive-from-renderer.js");
  var out = deriveCanonical();
  // Wiring check, not a comparison against a second source: both slugs below
  // just confirm deriveCanonical() routes a slug's fragment through
  // deriveFragment() (the renderer) rather than through anything else. The
  // two assertions are not meaningfully different from each other; two slugs
  // are asserted only to catch a per-slug wiring mistake a single slug could
  // miss.
  assert.strictEqual(out.fragments["button"], deriveFragment("button"));
  assert.strictEqual(out.fragments["text-input"], deriveFragment("text-input"));
  var badge = out.manifest.renders.find(function (r) {
    return r.slug === "badge";
  });
  assert.strictEqual(badge.source, "rendered");
});
