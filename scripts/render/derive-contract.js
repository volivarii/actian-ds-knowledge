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
//
// The LAST branch ends at the switch's `default:`, not at end of file. Without
// that bound it absorbs the default branch, the catch, BUILT_SLUGS and the
// exports block: harmless only for as long as no `props.X` read exists below the
// switch, and the day one appears that slug silently gains a prop it never reads.
function caseBlocks(src) {
  var marks = [];
  // Deliberately narrow: matching anything AFTER the colon consumes it, and two
  // fall-through labels on consecutive lines then lose the second, so the derive
  // throws "no renderer branch found" about a branch that plainly exists. The
  // indent is read back off the match itself, which needs no extra capture.
  var re = /\n[ \t]*case "([a-z0-9-]+)":/g;
  var m;
  while ((m = re.exec(src)) !== null) marks.push([m.index, m[1], m[0]]);
  var out = Object.create(null);
  if (!marks.length) return out;
  var last = marks[marks.length - 1];
  // Matched at the case markers' OWN indentation, so a nested switch's deeper
  // `default:` cannot end the outer block early and drop every prop after it.
  var indent = (last[2].match(/\n([ \t]*)case/) || [])[1] || "";
  var endRe = new RegExp("\\n" + indent + "default:");
  var defaultAt = src.slice(last[0]).search(endRe);
  if (defaultAt === -1) {
    // Falling back to end-of-file here would silently reproduce the very
    // over-extension this bound exists to prevent, and only a test against the
    // real renderer would ever notice. This module throws on its other
    // impossible states; a switch with no default is one of them.
    throw new Error(
      "derive-contract: no `default:` branch found at the case indentation, so " +
        "the last case block has no end. The renderer's switch shape changed.",
    );
  }
  var switchEnd = last[0] + defaultAt;
  for (var i = 0; i < marks.length; i++) {
    var start = marks[i][0];
    var end = i + 1 < marks.length ? marks[i + 1][0] : switchEnd;
    var slug = marks[i][1];
    out[slug] = (out[slug] || "") + src.slice(start, end);
  }
  return out;
}

// --- props -------------------------------------------------------------------
// Both spellings the renderer uses: props.Name, and props["Name with spaces"].
var DOT_READ = /props\.([A-Za-z_][A-Za-z0-9_]*)/g;
var BRACKET_READ = /props\[\s*"([^"]+)"\s*\]/g;
// `props.X || "literal"` is the renderer stating its own default.
//
// The chain form matters. `props.Headline || props.Title || "No policies"` states
// ONE default, and the prop a consumer should set is the FIRST of the chain;
// binding the literal to the last alias before it inverts that. Chain order
// differs per slug, so getting this wrong made siblings contradict each other
// (empty-state defaulting Title while confirmation defaulted Headline), and the
// content layer this field exists to seed would have filled the alias and left
// the preferred prop empty. So the pattern below skips any `|| props.Y` links and
// binds the literal to the head of the chain.
//
// KNOWN LIMIT, stated because absence here reads as "there is no fallback": a
// chain whose fallback is not a prop and not a literal publishes NO default,
// even though the renderer states one. Four props today, in two shapes:
//
//   a non-props operand mid-chain
//     global-header.App          props.App || v["App type"] || "Studio"
//     whats-new-dropdown.Detail  props.Detail || wnFirstItem || "New items..."
//   a fallback that is a variable rather than a literal
//     tag-item-type.Label        props.Label || titRaw
//     search-dropdown-menu.Heading  props.Heading || sdmHeadingDefault
//
// Resolving either means following identifiers through the renderer, which is
// static analysis this file deliberately does not do: a wrong default is worse
// than a missing one, since the content layer can author what is missing but
// will silently trust what is wrong. The count is stated here, next to the
// enumeration that carries it, and NOT in the published schema, where a
// hand-maintained number would be a consumer-visible claim that goes stale.
var PROP_REF = 'props(?:\\.([A-Za-z_][A-Za-z0-9_]*)|\\[\\s*"([^"]+)"\\s*\\])';
var DEFAULT_CHAIN = new RegExp(
  PROP_REF +
    '(?:\\s*\\|\\|\\s*props(?:\\.[A-Za-z_][A-Za-z0-9_]*|\\[\\s*"[^"]+"\\s*\\]))*' +
    '\\s*\\|\\|\\s*"((?:[^"\\\\]|\\\\.)*)"',
  "g",
);

// A blanket `\\(.)` -> `$1` turned "a\nb" into "anb", and the first attempt to
// fix it covered only the single-character escapes: an accented character written
// as "é" still published as the text u00e9, which reads as a plausible
// default rather than as an error. Defaults are user-facing copy, so the numeric
// forms matter as much as the named ones.
var ESCAPES = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  v: "\v",
  0: "\0",
  "\\": "\\",
  '"': '"',
  "'": "'",
};
function unescapeLiteral(s) {
  return s.replace(
    /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g,
    function (_, seq) {
      // A MALFORMED escape falls through to the bare single-character
      // alternative, so `\u` before non-hex arrives here as just "u", and
      // parseInt("") is NaN. The reachable vector is a comment, which this
      // extractor scans as plain text, so a Windows path in a comment could turn
      // into a hard derive failure naming neither the file nor the literal.
      // The RANGE CHECK below is what prevents that (NaN fails it, and so does
      // an out-of-range codepoint); the length test is redundant with it and
      // kept only because it names the malformed case where a reader meets it.
      if (seq.length > 1 && (seq[0] === "u" || seq[0] === "x")) {
        var code = parseInt(seq.replace(/^u\{|^u|^x|\}$/g, ""), 16);
        // Out of range is a SyntaxError in real JS, so it can only reach here
        // from text that is not a string literal. Left as written rather than
        // thrown on, for the same reason.
        if (code >= 0 && code <= 0x10ffff) return String.fromCodePoint(code);
        return seq;
      }
      return Object.prototype.hasOwnProperty.call(ESCAPES, seq)
        ? ESCAPES[seq]
        : seq;
    },
  );
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
  collect(DEFAULT_CHAIN, block, function (m) {
    var head = m[1] || m[2];
    var literal = unescapeLiteral(m[3]);
    // An empty fallback is the absence of a default, not a default of "".
    // Discarded HERE rather than at emit, because recorded it would win
    // first-wins and block a real literal for the same prop later in the same
    // branch: the prop would then publish no default while the renderer plainly
    // states one, decided by nothing but the order the two chains appear in.
    if (literal === "") return;
    if (defaults[head] === undefined) defaults[head] = literal;
  });

  return Object.keys(names)
    .sort()
    .map(function (name) {
      var entry = { name: name };
      // Empty literals never reach this map (see the record site above), so a
      // present value is always a real default. Deliberately NOT a truthiness
      // check: it would read as guarding the empty case while actually being
      // equivalent, since "0" and every other non-empty string is truthy.
      if (defaults[name] !== undefined) entry.default = defaults[name];
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
function deriveContract(options) {
  var opts = options || {};
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

  // rendersAs is measured from rendered markup, so two values that differ only by
  // their glyph collapse into an alias when the icon map is absent. Publishing
  // "the renderer cannot tell these apart" about a renderer that can is a false
  // all-clear wearing the shape of a finding, and it would be believed: consumers
  // read this file precisely so they do not have to check. Absent icons stop the
  // derive. Artwork is different and stays tolerated: graphics.json is a newer
  // dist that an older checkout may not have, and a missing illustration cannot
  // make two variant values render the same markup.
  var icons =
    opts.icons || loadJson("components/dist/icons/icons.json", "icons");
  if (!Object.keys(icons).length) {
    throw new Error(
      "derive-contract: the icon map is empty, so a value that differs only by " +
        "its icon would be recorded as an alias of another. Run the icons derive " +
        "first (components/dist/icons/icons.json).",
    );
  }
  dsMap.setIcons(icons);
  dsMap.setGraphics(
    opts.graphics ||
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

// Declared next to the loads that read them, so the workflow test can assert the
// derive-and-auto-commit job watches every input. The committed-vs-fresh test
// runs in the required manifest check on every PR, while only render-derive.yml
// can repair a drift; an unwatched input reds a required check nothing can fix.
var INPUTS = [
  DS_MAP_REL,
  "components/dist/registries/",
  "components/dist/icons/",
  "components/dist/graphics/",
];

module.exports = {
  deriveContract: deriveContract,
  writeContract: writeContract,
  INPUTS: INPUTS,
  // Exported for the extractor's own unit tests: an or-chain default and a
  // falsy literal have no instance in the renderer today, and a latent silent
  // drop is exactly what a contract consumer cannot detect.
  propsOf: propsOf,
  // Exported for the partition self-guard in tests: a phantom `case` marker
  // inside a comment or a string would split a real branch and silently drop
  // every prop after it, which is indistinguishable from a prop never read.
  caseBlocks: caseBlocks,
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
