"use strict";
// The FM tier's variant-collapse census: which modifier classes the FM
// renderer emits when driven by the registry's own axes and values, which of
// them fm-base.css actually styles, and which values of an axis render alike
// once the unstyled classes are removed.
//
// The join is registry x renderer x stylesheet, computed rather than listed:
// fmkit.json's `fm-<slug>` entries name the renderer's `fm<Slug>` cases in a
// second spelling, so a new component or value the stylesheet ignores shows up
// here without anyone editing a list. Consumers: the dated quality roll-up
// (derive-quality-trend.js) and tests/render/fm-css-owners.test.js.
//
// "Owned" means a rule with at least one declaration. An empty
// `.fm-button--secondary {}` block styles nothing and must not count, or the
// figure could be silenced without changing what a reader sees (#554).

var fs = require("node:fs");
var path = require("node:path");

var REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
var CSS_PATH = path.join(REPO_ROOT, "components/render/renderer/fm-base.css");
var REGISTRY_PATH = path.join(REPO_ROOT, "components/dist/registries/fmkit.json");
var RENDERER_PATH = path.join(
  REPO_ROOT,
  "components/render/renderer/html-renderers/fm-html-map.js",
);

var MODIFIER_RE = /^fm-[a-z0-9-]+--[a-z0-9-]+$/;

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

/** Modifier classes a stylesheet owns with at least one declaration. */
function ownedModifiers(cssText) {
  var owned = new Set();
  var re = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  while ((m = re.exec(cssText)) !== null) {
    var hasDecl = m[2].split(";").some(function (d) {
      return /^\s*[a-z-]+\s*:\s*\S/.test(d);
    });
    if (!hasDecl) continue;
    var clsRe = /\.(fm-[a-z0-9-]+--[a-z0-9-]+)/g;
    var c;
    while ((c = clsRe.exec(m[1])) !== null) owned.add(c[1]);
  }
  return owned;
}

function modifierClasses(html) {
  var out = new Set();
  var re = /class="([^"]*)"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    m[1].split(/\s+/).forEach(function (c) {
      if (MODIFIER_RE.test(c)) out.add(c);
    });
  }
  return out;
}

/** The markup with every modifier class the stylesheet does not own removed:
 *  what a reader can actually tell apart. */
function stripUnowned(html, owned) {
  return html.replace(/class="([^"]*)"/g, function (_, cls) {
    var kept = cls.split(/\s+/).filter(function (c) {
      return !MODIFIER_RE.test(c) || owned.has(c);
    });
    return 'class="' + kept.join(" ") + '"';
  });
}

/**
 * census(opts?) -> {
 *   owned: Set<class>, emitted: Map<class, "slug Axis=Value">, axes: number,
 *   unownedModifiers: [{ class, origin }],
 *   collapsedGroups: [{ slug, axis, values }],
 * }
 * opts.cssText / opts.registry / opts.renderer override the repo's files, so
 * the helper is testable without touching them.
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
  var unownedModifiers = [];
  var collapsedGroups = [];
  var axes = 0;
  var components = registry.components || {};
  Object.keys(components).forEach(function (slug) {
    if (!/^fm-/.test(slug)) return;
    var variants = components[slug].variants || {};
    var ref = refOf(slug);
    Object.keys(variants).forEach(function (axis) {
      axes++;
      var byHtml = new Map();
      (variants[axis] || []).forEach(function (value) {
        var html = renderer.renderFMComponent({
          type: "INSTANCE",
          ref: ref,
          variant: axis + "=" + value,
          props: {},
        });
        modifierClasses(html).forEach(function (c) {
          if (!emitted.has(c)) {
            emitted.set(c, slug + " " + axis + "=" + value);
            if (!owned.has(c)) {
              unownedModifiers.push({ class: c, origin: emitted.get(c) });
            }
          }
        });
        var key = stripUnowned(html, owned);
        if (!byHtml.has(key)) byHtml.set(key, []);
        byHtml.get(key).push(value);
      });
      byHtml.forEach(function (values) {
        if (values.length > 1) {
          collapsedGroups.push({ slug: slug, axis: axis, values: values });
        }
      });
    });
  });
  return {
    owned: owned,
    emitted: emitted,
    axes: axes,
    unownedModifiers: unownedModifiers,
    collapsedGroups: collapsedGroups,
  };
}

module.exports = {
  refOf: refOf,
  ownedModifiers: ownedModifiers,
  stripUnowned: stripUnowned,
  census: census,
};
