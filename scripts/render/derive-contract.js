"use strict";

// derive-contract.js: publish, per render slug, the contract the renderer
// actually implements: the content props its branch reads, the fallback each one
// has, and which of the registry's variant values it renders distinctly.
//
// WHY THIS EXISTS
//
// Consumers were restating these facts by hand and drifting. The plugin's
// flow-authoring reference opens with "the following 19 slugs have real HTML leaf
// renderers"; the renderer has 58 branches. It documents 45 (slug, prop) bindings;
// the renderer exposes 177. So 39 components are invisible to flow generation, and
// even a documented one is short: empty-state is described with 3 props and reads
// 7, which means an author is told they may use the component and then cannot set
// its title, its illustration, or either of its actions.
//
// That is the same failure that cost three repos two weeks in July: a consumer
// restating by hand a fact the producer already owns. The fix is the relation, not
// a better list. This file is the relation.
//
// It is also the prerequisite for a real content layer. `default-props.json`
// exists to give each render example content and has 3 entries and zero readers;
// nothing knew which props needed values. The `props` array below is that list.
//
// HOW EACH FACT IS DERIVED (nothing here is hand-maintained)
//
//   slugs        matrix.RENDER_SLUGS, which reads the `case "<slug>":` branches
//   group        the component's registry category, via matrix.groupFor
//   props        the `props.X` / `props["X"]` reads inside that slug's branch
//   default      the string literal the renderer itself falls back to
//   variants     the registry's own axes and values
//   rendersAs    MEASURED: each value is rendered and hashed, and a value whose
//                markup matches an earlier value of the same axis is recorded as
//                an alias of it. Textual analysis cannot do this honestly (a
//                generic `"is-" + v.State.toLowerCase()` handles values it never
//                names), so this one is behavioural on purpose. It self-corrects
//                the moment the renderer learns a difference it did not have.

var fs = require("node:fs");
var path = require("node:path");
var crypto = require("node:crypto");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var RENDERER_DIR = path.join(REPO_ROOT, "components", "render", "renderer");
var DS_MAP_REL = "components/render/renderer/html-renderers/ds-html-map.js";
var DS_MAP_PATH = path.join(REPO_ROOT, DS_MAP_REL);
var OUT_PATH = path.join(
  REPO_ROOT,
  "components",
  "render",
  "dist",
  "render-contract.json",
);

var matrix = require(path.join(RENDERER_DIR, "matrix.js"));
var dsMap = require(
  path.join(RENDERER_DIR, "html-renderers", "ds-html-map.js"),
);

var SCHEMA_VERSION = "1.0.0";

// --- the renderer's own asset maps, so a rendered comparison sees real glyphs ---
// Two variant values that differ ONLY by icon would hash identically without
// these, and the contract would claim the renderer cannot tell them apart.
function loadJson(rel, key) {
  try {
    return require(path.join(REPO_ROOT, rel))[key] || {};
  } catch (e) {
    return {};
  }
}

// --- case blocks -------------------------------------------------------------
// A branch runs from its `case "<slug>":` to the next one. A slug with more than
// one branch (none today, but the switch does not forbid it) gets them joined,
// so a prop read in the second branch is not silently dropped.
function caseBlocks(src) {
  var marks = [];
  var re = /\n[ \t]*case "([a-z0-9-]+)":/g;
  var m;
  while ((m = re.exec(src)) !== null) marks.push([m.index, m[1]]);
  var out = Object.create(null);
  for (var i = 0; i < marks.length; i++) {
    var start = marks[i][0];
    var end = i + 1 < marks.length ? marks[i + 1][0] : src.length;
    var slug = marks[i][1];
    out[slug] = (out[slug] || "") + src.slice(start, end);
  }
  return out;
}

// --- props -------------------------------------------------------------------
// Both spellings the renderer uses: props.Name, and props["Name with spaces"].
var DOT_READ = /props\.([A-Za-z_][A-Za-z0-9_]*)/g;
var BRACKET_READ = /props\[\s*"([^"]+)"\s*\]/g;
// `props.X || "literal"` is the renderer stating its own default. The literal is
// captured with escapes intact and unescaped once, so a default containing a
// quote survives.
var DOT_DEFAULT =
  /props\.([A-Za-z_][A-Za-z0-9_]*)\s*\|\|\s*"((?:[^"\\]|\\.)*)"/g;
var BRACKET_DEFAULT = /props\[\s*"([^"]+)"\s*\]\s*\|\|\s*"((?:[^"\\]|\\.)*)"/g;

function unescapeLiteral(s) {
  return s.replace(/\\(.)/g, "$1");
}

function collect(re, block, onMatch) {
  re.lastIndex = 0;
  var m;
  while ((m = re.exec(block)) !== null) onMatch(m);
}

function propsOf(block) {
  var names = Object.create(null);
  collect(DOT_READ, block, function (m) {
    names[m[1]] = true;
  });
  collect(BRACKET_READ, block, function (m) {
    names[m[1]] = true;
  });

  var defaults = Object.create(null);
  collect(DOT_DEFAULT, block, function (m) {
    if (defaults[m[1]] === undefined) defaults[m[1]] = unescapeLiteral(m[2]);
  });
  collect(BRACKET_DEFAULT, block, function (m) {
    if (defaults[m[1]] === undefined) defaults[m[1]] = unescapeLiteral(m[2]);
  });

  return Object.keys(names)
    .sort()
    .map(function (name) {
      var entry = { name: name };
      // An empty fallback is the absence of a default, not a default of "".
      // Emitting it would invite a consumer to render `default: ""` as guidance.
      if (defaults[name]) entry.default = defaults[name];
      return entry;
    });
}

// --- variants ----------------------------------------------------------------
function hash(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

// Constant props on purpose: the question is what the VARIANT changes, and a
// per-value label would make every cell differ for a reason that is not the axis.
var PROBE_PROPS = { Label: "Contract probe" };

function variantsOf(slug, comp) {
  var variants = (comp && comp.variants) || {};
  var out = {};
  Object.keys(variants).forEach(function (axis) {
    var values = variants[axis];
    if (!Array.isArray(values) || !values.length) return;
    var rendersAs = {};
    if (values.length > 1) {
      var seen = Object.create(null);
      values.forEach(function (value) {
        var html;
        try {
          html = dsMap.renderDSComponent({
            dsSlug: slug,
            variant: axis + "=" + value,
            props: PROBE_PROPS,
          });
        } catch (e) {
          // renderDSComponent is documented never to throw; if that ever changes,
          // an unrenderable value must not be reported as an alias of a good one.
          html = "render-error:" + value;
        }
        var key = hash(html);
        if (seen[key] !== undefined && seen[key] !== value) {
          rendersAs[value] = seen[key];
        } else if (seen[key] === undefined) {
          seen[key] = value;
        }
      });
    }
    out[axis] = { values: values.slice(), rendersAs: rendersAs };
  });
  return out;
}

// --- derive ------------------------------------------------------------------
function deriveContract() {
  var src = fs.readFileSync(DS_MAP_PATH, "utf8");
  var blocks = caseBlocks(src);
  var slugs = matrix.RENDER_SLUGS;

  var missing = slugs.filter(function (s) {
    return !blocks[s];
  });
  if (missing.length) {
    // RENDER_SLUGS is read from the same `case` markers, so this can only fire if
    // the two readers disagree. Failing loudly beats publishing an empty contract
    // for a component that renders.
    throw new Error(
      "derive-contract: no renderer branch found for " + missing.join(", "),
    );
  }

  dsMap.setIcons(loadJson("components/dist/icons/icons.json", "icons"));
  dsMap.setGraphics(
    loadJson("components/dist/graphics/graphics.json", "graphics"),
  );
  var out = {};
  try {
    slugs.forEach(function (slug) {
      var comp = matrix.findComponent(slug);
      out[slug] = {
        group: matrix.groupFor(slug),
        props: propsOf(blocks[slug]),
        variants: variantsOf(slug, comp),
      };
    });
  } finally {
    dsMap.setIcons(null);
    dsMap.setGraphics(null);
  }

  return {
    _meta: {
      auto_generated: true,
      source: DS_MAP_REL + " + components/dist/registries/*.json",
      do_not_edit:
        "Regenerate with `npm run derive:render`. Hand edits are overwritten.",
    },
    schemaVersion: SCHEMA_VERSION,
    generatedBy: "scripts/render/derive-contract.js",
    slugs: out,
  };
}

function writeContract(outPath) {
  var target = outPath || OUT_PATH;
  fs.writeFileSync(target, JSON.stringify(deriveContract(), null, 2) + "\n");
  return target;
}

module.exports = {
  deriveContract: deriveContract,
  writeContract: writeContract,
  OUT_PATH: OUT_PATH,
};

if (require.main === module) {
  var written = writeContract(process.argv[2]);
  var contract = JSON.parse(fs.readFileSync(written, "utf8"));
  var bindings = Object.keys(contract.slugs).reduce(function (n, slug) {
    return n + contract.slugs[slug].props.length;
  }, 0);
  process.stdout.write(
    "render contract: " +
      Object.keys(contract.slugs).length +
      " slugs, " +
      bindings +
      " (slug, prop) bindings -> " +
      path.relative(REPO_ROOT, written) +
      "\n",
  );
}
