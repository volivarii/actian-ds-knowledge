"use strict";
// The FM tier's variant-collapse census, in the DS tier's own shape.
//
// It drives the FM renderer with the FM registry's own axes and values, reads
// which modifier classes fm-base.css styles (a rule with a declaration, never
// a comment or an empty block), and builds the same `{ slugs: { <slug>: {
// variants: { <axis>: { values, rendersAs } } } } }` contract the DS tier's
// derive-contract.js emits, so variant-collapse.js `classify` judges both tiers
// with one classifier, one State-axis rule and one ledger shape
// (fm-collapse-by-design.js). Nothing here is a list of components, axes,
// values or classes: fmkit.json's `fm-<slug>` names the renderer's `fm<Slug>`
// case in a second spelling, and that is the whole join.
//
// Two values "render alike" when their markup is identical once every class
// the stylesheet does not own is removed and every class it does own is
// replaced by the signature of its declarations. Keying on the declarations,
// not the class name, is what makes a byte-copied rule read as the same look.
// Consumers: derive-quality-trend.js and tests/render/fm-css-owners.test.js.

var fs = require("node:fs");
var path = require("node:path");
var crypto = require("node:crypto");

var REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
var CSS_PATH = path.join(REPO_ROOT, "components/render/renderer/fm-base.css");
var REGISTRY_PATH = path.join(REPO_ROOT, "components/dist/registries/fmkit.json");
var RENDERER_PATH = path.join(
  REPO_ROOT,
  "components/render/renderer/html-renderers/fm-html-map.js",
);
var SOURCES = [
  "components/render/renderer/fm-base.css",
  "components/render/renderer/html-renderers/fm-html-map.js",
  "components/dist/registries/fmkit.json",
];

// fm-<block>[__<element>]--<modifier>. The modifier charset is the class
// token itself minus quotes and spaces: the renderer lowercases raw registry
// values into it, so "Label+1line" arrives as `+1line` and must count.
var MODIFIER_RE = /^fm-[a-z0-9-]+(?:__[a-z0-9-]+)?--[^\s"']+$/;
var CHIP_RE = /^<span class="fm-component" data-ref=/;

// fm-button -> fmButton, fm-multi-select-dropdown -> fmMultiSelectDropdown.
function refOf(slug) {
  return (
    "fm" +
    slug
      .replace(/^fm-/, "")
      .split("-")
      .map(function (p) {
        return p.charAt(0).toUpperCase() + p.slice(1);
      })
      .join("")
  );
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function signature(decls) {
  return crypto.createHash("sha1").update(decls.join(";")).digest("hex").slice(0, 10);
}

/** Map of modifier class -> signature of the declarations that style it.
 *  A rule counts only with at least one declaration; comments are stripped
 *  first so a class named in prose owns nothing; a CSS-escaped `\+` is the
 *  literal `+` the renderer emits. */
function ownedModifiers(cssText) {
  var owned = new Map();
  var declsByClass = new Map();
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  while ((m = re.exec(stripComments(cssText))) !== null) {
    var decls = m[2]
      .split(";")
      .map(function (d) {
        return d.replace(/\s+/g, " ").trim();
      })
      .filter(function (d) {
        return /^[a-z-]+ ?: ?\S/.test(d);
      });
    if (decls.length === 0) continue;
    var clsRe = /\.(fm-(?:\\.|[^\s.,:>+~\[\]{}#])+)/g;
    var c;
    while ((c = clsRe.exec(m[1])) !== null) {
      var cls = c[1].replace(/\\(.)/g, "$1");
      if (!MODIFIER_RE.test(cls)) continue;
      if (!declsByClass.has(cls)) declsByClass.set(cls, []);
      declsByClass.get(cls).push.apply(declsByClass.get(cls), decls);
    }
  }
  declsByClass.forEach(function (decls, cls) {
    owned.set(cls, signature(decls.slice().sort()));
  });
  return owned;
}

function modifierClasses(html) {
  var out = [];
  var re = /class="([^"]*)"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    m[1].split(/\s+/).forEach(function (c) {
      if (MODIFIER_RE.test(c) && out.indexOf(c) < 0) out.push(c);
    });
  }
  return out;
}

/** What a reader can tell apart: the markup with unowned modifier classes
 *  removed and owned ones replaced by their declaration signature. */
function renderKey(html, owned) {
  return html.replace(/class="([^"]*)"/g, function (_, cls) {
    var kept = cls.split(/\s+/).map(function (c) {
      if (!MODIFIER_RE.test(c)) return c;
      return owned.has(c) ? "sig:" + owned.get(c) : "";
    });
    return 'class="' + kept.filter(Boolean).join(" ") + '"';
  });
}

/**
 * census(opts?) -> {
 *   owned: Map<class, signature>, emitted: Map<class, "slug Axis=Value">,
 *   classesByValue: { "<slug> <axis>=<value>": [classes] },
 *   unownedModifiers: [{ class, origin }], ownedNotEmitted: [class],
 *   unrendered: [slug], contract: { slugs: { ... } }, axes: number,
 * }
 * opts.cssText / opts.registry / opts.renderer override the repo's files.
 */
function census(opts) {
  opts = opts || {};
  var cssText =
    opts.cssText !== undefined ? opts.cssText : fs.readFileSync(CSS_PATH, "utf8");
  var registry =
    opts.registry || JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  var renderer = opts.renderer || require(RENDERER_PATH);
  var owned = ownedModifiers(cssText);
  var emitted = new Map();
  var classesByValue = {};
  var unownedModifiers = [];
  var unrendered = [];
  var slugs = {};
  var axes = 0;
  var components = registry.components || {};
  Object.keys(components).forEach(function (slug) {
    if (!/^fm-/.test(slug)) return;
    var variants = components[slug].variants || {};
    var axisNames = Object.keys(variants);
    if (axisNames.length === 0) return;
    var ref = refOf(slug);
    var probe = renderer.renderFMComponent({ type: "INSTANCE", ref: ref, variant: "", props: {} });
    if (CHIP_RE.test(String(probe))) {
      unrendered.push(slug);
      return;
    }
    var out = { variants: {} };
    axisNames.forEach(function (axis) {
      axes++;
      var values = variants[axis] || [];
      var anchorByKey = new Map();
      var rendersAs = {};
      values.forEach(function (value) {
        var html = renderer.renderFMComponent({
          type: "INSTANCE",
          ref: ref,
          variant: axis + "=" + value,
          props: {},
        });
        var origin = slug + " " + axis + "=" + value;
        var classes = modifierClasses(html);
        classesByValue[origin] = classes;
        classes.forEach(function (c) {
          if (!emitted.has(c)) {
            emitted.set(c, origin);
            if (!owned.has(c)) unownedModifiers.push({ class: c, origin: origin });
          }
        });
        var key = renderKey(html, owned);
        if (anchorByKey.has(key)) rendersAs[value] = anchorByKey.get(key);
        else anchorByKey.set(key, value);
      });
      out.variants[axis] = { values: values.slice(), rendersAs: rendersAs };
    });
    slugs[slug] = out;
  });
  var ownedNotEmitted = [];
  owned.forEach(function (_, cls) {
    if (!emitted.has(cls)) ownedNotEmitted.push(cls);
  });
  return {
    owned: owned,
    emitted: emitted,
    classesByValue: classesByValue,
    unownedModifiers: unownedModifiers,
    ownedNotEmitted: ownedNotEmitted.sort(),
    unrendered: unrendered.sort(),
    contract: { slugs: slugs },
    axes: axes,
  };
}

module.exports = {
  SOURCES: SOURCES,
  refOf: refOf,
  ownedModifiers: ownedModifiers,
  renderKey: renderKey,
  census: census,
};
