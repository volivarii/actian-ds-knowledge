"use strict";

// Derives components/render/dist/geometry-report.json: how much of the SHAPE
// the Figma capture measured does the stylesheet actually state, and where do
// the two disagree.
//
// The colour report next to it (fidelity-report.json) examines 447 declarations
// and every one of them is a colour, because its reader stops at the capture's
// `appearance` object. The capture also measures gap, padding and size on every
// node, and names the design token behind many of those values, and nothing had
// ever read it. This does.
//
// It REPORTS. It does not exit non-zero on a disagreement, and that is
// deliberate for exactly one release: the first run finds dozens, and a gate
// that reds the build on its first sight of a backlog gets waved through rather
// than worked. The gate is tests/render/geometry-ratchet.test.js, which lets
// the disagreement count FALL and never rise, so the backlog is worked down
// under a check that cannot be re-entered. A count that may only fall is a
// stronger commitment than a threshold nobody can pass today.

var fs = require("node:fs");
var path = require("node:path");

var G = require("./geometry-classify.js");
var F = require("./fidelity-check.js");
var A = require("./derive-appearance.js");
var D = require("./derive-canonical.js");
var MATRIX = require("../../components/render/renderer/matrix.js");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var OUT_REL = "components/render/dist/geometry-report.json";
var OUT_PATH = path.join(REPO_ROOT, OUT_REL);
var SCHEMA_VERSION = "1.0.0";

// Everything a run reads, named here rather than left for a reader to
// reconstruct from the workflow. tests/render/derive-contract.test.js asserts
// every entry is watched by a render-derive.yml trigger, and it earned its keep
// on the first draft of this list: it caught
// `components/render/dist/fragments/**`, which is not an input at all. The
// fragments are OUTPUT of this same derive chain, and the way a fragment
// changes is that the renderer changed, which is the path below.
var INPUTS = [
  // The stylesheet whose declarations are one side of every comparison.
  "components/render/renderer/ds-base.css",
  // The markup, which decides which of those declarations a slug actually
  // emits (filterCssForFragment) and therefore which are examined at all.
  "components/render/renderer/html-renderers/ds-html-map.js",
  // The oracle. A Figma sync arrives here.
  "components/dist/anatomy/",
  // The token map: `var(--zen-spacing-xs)` is only comparable to 8px if
  // something resolves it.
  "tokens/tokens.json",
];

function deriveGeometryReport(ctx) {
  var REQUIRED = ["anatomyDir", "css", "tokenMap", "fragmentsDir"];
  for (var i = 0; i < REQUIRED.length; i++) {
    if (!ctx || !ctx[REQUIRED[i]])
      throw new Error(
        "deriveGeometryReport requires ctx." +
          REQUIRED[i] +
          ": it reads only the per-slug capture and fragment markup, so the " +
          "caller controls everything else about what is measured.",
      );
  }
  var shared = F.sharedPrefixMap();
  var bySlug = {};
  var mismatches = [];
  var tokenNameAgreements = [];
  var reasons = {};
  var blind = [];
  var totals = {
    verified: 0,
    verifiedViaTokenName: 0,
    mismatch: 0,
    unverifiable: 0,
    overridden: 0,
  };

  MATRIX.RENDER_SLUGS.slice()
    .sort()
    .forEach(function (slug) {
      var layout = null;
      var captureError = null;
      try {
        layout = G.readLayout(slug, ctx.anatomyDir);
      } catch (e) {
        layout = null;
        // A capture that is ABSENT and a capture that could not be READ are
        // different findings. Swallowing both into "no-capture" is how a
        // corrupt anatomy file reads as an honest gap in Figma's coverage, and
        // the reasons table is where a reader would look for the difference.
        captureError =
          e && e.code === "ENOENT" ? "no-capture" : "capture-unreadable";
      }

      var fragmentHtml = "";
      try {
        fragmentHtml = fs.readFileSync(
          path.join(ctx.fragmentsDir, slug + ".html"),
          "utf8",
        );
      } catch (e) {
        fragmentHtml = "";
      }
      var prefixes = MATRIX.ownedPrefixes(slug);
      var filteredCss = F.filterCssForFragment(
        ctx.css,
        F.fragmentClasses(fragmentHtml),
        prefixes,
        shared,
      );

      var r = G.classifySlugGeometry({
        slug: slug,
        prefixes: prefixes,
        css: filteredCss,
        layout: layout,
        captureError: captureError,
        tokenMap: ctx.tokenMap,
        sharedPrefixes: shared,
      });

      // Same honesty the colour report carries: a slug the capture can say
      // NOTHING about must be countable and explicit, never indistinguishable
      // from one that was checked and found clean.
      var isBlind =
        r.verified === 0 && r.mismatch === 0 && r.verifiedViaTokenName === 0;
      if (isBlind) blind.push(slug);
      bySlug[slug] = {
        prefixes: r.prefixes,
        verified: r.verified,
        verifiedViaTokenName: r.verifiedViaTokenName,
        mismatch: r.mismatch,
        unverifiable: r.unverifiable,
        overridden: r.overridden,
        blind: isBlind,
      };
      totals.verified += r.verified;
      totals.verifiedViaTokenName += r.verifiedViaTokenName;
      totals.mismatch += r.mismatch;
      totals.unverifiable += r.unverifiable;
      totals.overridden += r.overridden;
      mismatches = mismatches.concat(r.mismatches);
      tokenNameAgreements = tokenNameAgreements.concat(r.tokenNameAgreements);
      Object.keys(r.reasons).forEach(function (k) {
        reasons[k] = (reasons[k] || 0) + r.reasons[k];
      });
    });

  // examined counts what the report LOOKED at, so an examined that shrinks
  // because declarations left the corpus is visible as a shrinking denominator
  // rather than as an improving ratio. Published as a pair for that reason, the
  // way oracle coverage is: the ratio improves when declarations leave, and
  // that is not progress.
  var examined =
    totals.verified +
    totals.verifiedViaTokenName +
    totals.mismatch +
    totals.unverifiable;

  mismatches.sort(function (a, b) {
    return (
      a.slug.localeCompare(b.slug) ||
      a.selector.localeCompare(b.selector) ||
      a.property.localeCompare(b.property)
    );
  });

  return {
    _meta: {
      auto_generated: true,
      source: INPUTS.join(", "),
      do_not_edit:
        "Regenerate with `npm run derive:render`. Hand edits are overwritten.",
    },
    schemaVersion: SCHEMA_VERSION,
    generatedBy: "scripts/render/derive-geometry-fidelity.js",
    scope:
      "gap, padding and fixed height, on the capture root and on per-variant " +
      "layout entries. Width is not read: a captured width is where the " +
      "instance sat on the Figma canvas, not a property of the component.",
    totals: Object.assign({ examined: examined }, totals),
    reasons: reasons,
    bySlug: bySlug,
    blind: blind.sort(),
    mismatches: mismatches,
    tokenNameAgreements: tokenNameAgreements,
  };
}

/** Assemble the context from the working tree and derive. */
function measureGeometry(opts) {
  var o = opts || {};
  var canonical = D.deriveCanonical();
  return deriveGeometryReport({
    anatomyDir:
      o.anatomyDir || path.join(REPO_ROOT, "components", "dist", "anatomy"),
    fragmentsDir:
      o.fragmentsDir ||
      path.join(REPO_ROOT, "components", "render", "dist", "fragments"),
    css:
      o.css ||
      fs.readFileSync(
        path.join(
          REPO_ROOT,
          "components",
          "render",
          "renderer",
          "ds-base.css",
        ),
        "utf8",
      ),
    tokenMap: o.tokenMap || A.loadTokenMap(canonical.css),
  });
}

function writeGeometry(outPath) {
  var target = outPath || OUT_PATH;
  var report = measureGeometry();
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  return target;
}

module.exports = {
  deriveGeometryReport: deriveGeometryReport,
  measureGeometry: measureGeometry,
  writeGeometry: writeGeometry,
  INPUTS: INPUTS,
  OUT_REL: OUT_REL,
  OUT_PATH: OUT_PATH,
  SCHEMA_VERSION: SCHEMA_VERSION,
};

if (require.main === module) {
  var written = writeGeometry(process.argv[2]);
  var out = JSON.parse(fs.readFileSync(written, "utf8"));
  var t = out.totals;
  process.stdout.write(
    "geometry fidelity: " +
      (t.verified + t.verifiedViaTokenName) +
      " of " +
      t.examined +
      " examined shape declarations agree with the capture (" +
      t.verified +
      " by value, " +
      t.verifiedViaTokenName +
      " by token name), " +
      t.mismatch +
      " disagree, " +
      t.unverifiable +
      " the capture cannot speak to, " +
      out.blind.length +
      " slugs it can say nothing about at all -> " +
      path.relative(REPO_ROOT, written) +
      "\n",
  );
}
