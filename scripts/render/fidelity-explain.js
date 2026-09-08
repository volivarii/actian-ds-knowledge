"use strict";

// The per-component fidelity view, and the repair it implies.
//
// The two reports next to it answer "how much of what we draw does the capture
// agree with", which is the right question for a trend and the wrong one for a
// person about to fix something. That person needs one component's facts in one
// place: what Figma measured, what the stylesheet states, which of the two
// numbers to change, and what the replacement declaration is. Today that means
// opening Figma, opening a render, and carrying five numbers into a
// 145,000-character stylesheet by hand.
//
//   node scripts/render/fidelity-explain.js              the worklist
//   node scripts/render/fidelity-explain.js <slug>       one component, every fact
//   node scripts/render/fidelity-explain.js <slug> --write   apply the shape repairs
//
// 🔑 `--write` is per slug and never corpus-wide, because copying the capture is
// the right repair for only ONE of the three things a disagreement can mean.

var fs = require("node:fs");
var path = require("node:path");

var G = require("./geometry-classify.js");
var R = require("./lib/geometry-repair.js");
var A = require("./derive-appearance.js");
var D = require("./derive-canonical.js");
var GEO = require("./derive-geometry-fidelity.js");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var BASE_CSS_REL = "components/render/renderer/ds-base.css";

function readJson(rel) {
  var p = path.join(REPO_ROOT, rel);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

/**
 * How many authored UX patterns name each component. A proxy for how often a
 * generated screen contains one, and it UNDERSTATES the chrome: every app
 * declares a header and a sidebar, so global-header and side-nav appear on
 * every screen regardless of what any pattern says. Reported as its own column
 * rather than folded into a score, because a composite would bury exactly that
 * caveat.
 */
function patternReach() {
  var ctx = readJson("app-context/dist/app-context.json") || {};
  var reach = {};
  Object.values(ctx.patterns || {}).forEach(function (p) {
    (p.components || []).forEach(function (slug) {
      reach[slug] = (reach[slug] || 0) + 1;
    });
  });
  return reach;
}

/** Nested components the capture names, and whether the parent draws theirs. */
function composition(slug) {
  var anatomyPath = path.join(
    REPO_ROOT,
    "components/dist/anatomy",
    slug + ".json",
  );
  if (!fs.existsSync(anatomyPath)) return null;
  var fragPath = path.join(
    REPO_ROOT,
    "components/render/dist/fragments",
    slug + ".html",
  );
  if (!fs.existsSync(fragPath)) return null;
  var html = fs.readFileSync(fragPath, "utf8");
  var named = new Set();
  (function walk(n) {
    if (!n) return;
    if (n.kind === "instance" && n.slug) named.add(n.slug);
    (n.children || []).forEach(walk);
  })(JSON.parse(fs.readFileSync(anatomyPath, "utf8")).root);

  // Icons and captured artwork are drawn by renderIcon/renderGraphic, not by a
  // component case, so "no renderer of its own" would put `arrow-down` and
  // `close` on a worklist as if something were missing. They are named here for
  // completeness and marked as what they are.
  var icons = readJson("components/dist/icons/icons.json") || {};
  var graphics = readJson("components/dist/graphics/graphics.json") || {};
  var iconSet = icons.icons || {};
  var graphicSet = graphics.graphics || {};

  var rows = [];
  named.forEach(function (child) {
    var childFrag = path.join(
      REPO_ROOT,
      "components/render/dist/fragments",
      child + ".html",
    );
    if (!fs.existsSync(childFrag)) {
      if (iconSet[child]) {
        rows.push({ slug: child, state: "an icon, drawn by renderIcon" });
        return;
      }
      if (graphicSet[child]) {
        rows.push({ slug: child, state: "captured artwork, drawn by renderGraphic" });
        return;
      }
      rows.push({ slug: child, state: "the child has no renderer of its own" });
      return;
    }
    var cls = rootClassOf(fs.readFileSync(childFrag, "utf8"));
    if (!cls) {
      rows.push({ slug: child, state: "the child's fragment has no root class" });
      return;
    }
    rows.push({
      slug: child,
      state:
        html.indexOf('"' + cls) !== -1 || html.indexOf(cls + " ") !== -1
          ? "composed"
          : "re-implemented or absent (" + cls + ")",
    });
  });
  return rows.sort(function (a, b) {
    return a.slug.localeCompare(b.slug);
  });
}

function rootClassOf(html) {
  var cell = /<div data-render-cell="[^"]*">\s*<([a-zA-Z][\w-]*)([^>]*)>/.exec(
    html,
  );
  if (!cell) return null;
  var m = /class="([^"]*)"/.exec(cell[2] || "");
  return m ? m[1].split(/\s+/).filter(Boolean)[0] : null;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function worklist(geo, colour, reach) {
  var lines = [];
  lines.push(
    "SHAPE disagreements per component, worst first. The pattern column is how " +
      "many authored UX patterns name it,",
  );
  lines.push(
    "and it understates the chrome: global-header and side-nav are on every " +
      "screen regardless.",
  );
  lines.push("");
  lines.push(
    "  " +
      pad("component", 30) +
      pad("shape x", 9) +
      pad("shape ok", 10) +
      pad("colour x", 10) +
      "patterns",
  );
  var rows = Object.keys(geo.bySlug)
    .map(function (slug) {
      var g = geo.bySlug[slug];
      var c = (colour && colour.bySlug && colour.bySlug[slug]) || {};
      return {
        slug: slug,
        shapeBad: g.mismatch,
        shapeOk: g.verified + g.verifiedViaTokenName,
        colourBad: c.mismatch || 0,
        reach: reach[slug] || 0,
      };
    })
    .filter(function (r) {
      return r.shapeBad > 0;
    })
    .sort(function (a, b) {
      return b.shapeBad - a.shapeBad || b.reach - a.reach || a.slug.localeCompare(b.slug);
    });
  rows.forEach(function (r) {
    lines.push(
      "  " +
        pad(r.slug, 30) +
        pad(r.shapeBad, 9) +
        pad(r.shapeOk, 10) +
        pad(r.colourBad, 10) +
        (r.reach || "."),
    );
  });
  lines.push("");
  lines.push(
    "  " +
      rows.length +
      " components disagree with the capture on " +
      rows.reduce(function (n, r) {
        return n + r.shapeBad;
      }, 0) +
      " declarations. `fidelity-explain <slug>` for one of them.",
  );
  return lines.join("\n");
}

function explain(slug, geo, colour, reach, css, tokenMap) {
  var lines = [];
  var g = geo.bySlug[slug];
  if (!g) {
    return (
      slug +
      " is not in the geometry report. Slugs the renderer implements are the " +
      "only ones measured; `fidelity-explain` with no argument lists them."
    );
  }
  var layout = null;
  try {
    layout = G.readLayout(slug, path.join(REPO_ROOT, "components/dist/anatomy"));
  } catch (e) {
    layout = null;
  }

  lines.push("");
  lines.push(slug.toUpperCase());
  lines.push(
    "  capture   " +
      (layout && layout.rootName ? layout.rootName : "(no capture)") +
      (layout && layout.root.axis ? "   axis " + layout.root.axis : ""),
  );
  lines.push("  patterns  " + (reach[slug] || 0) + " name it");
  var c = (colour && colour.bySlug && colour.bySlug[slug]) || {};
  lines.push(
    "  shape     " +
      (g.verified + g.verifiedViaTokenName) +
      " agree, " +
      g.mismatch +
      " disagree, " +
      g.unverifiable +
      " the capture cannot speak to" +
      (g.blind ? "   BLIND: it can say nothing at all" : ""),
  );
  lines.push(
    "  colour    " +
      ((c.verified || 0) + (c.verifiedViaTokenName || 0)) +
      " agree, " +
      (c.mismatch || 0) +
      " disagree, " +
      (c.unverifiable || 0) +
      " the capture cannot speak to",
  );

  var parts = composition(slug);
  if (parts && parts.length) {
    var components = parts.filter(function (p) {
      return p.state.indexOf("drawn by render") === -1;
    });
    var composed = components.filter(function (p) {
      return p.state === "composed";
    }).length;
    lines.push(
      "  parts     capture names " +
        components.length +
        " nested component(s), this render draws " +
        composed +
        (parts.length > components.length
          ? " (plus " + (parts.length - components.length) + " icon/artwork)"
          : ""),
    );
    parts.forEach(function (p) {
      if (p.state !== "composed")
        lines.push("              " + pad(p.slug, 26) + p.state);
    });
  }

  var mine = geo.mismatches.filter(function (m) {
    return m.slug === slug;
  });
  if (!mine.length) {
    lines.push("");
    lines.push("  Nothing to repair: the shape agrees everywhere it can be checked.");
    return lines.join("\n");
  }

  var made = R.proposals({
    css: css,
    tokenMap: tokenMap,
    mismatches: mine,
    expandPadding: G.expandPadding,
  });

  lines.push("");
  lines.push("  DISAGREEMENTS AND THE DECLARATION THAT WOULD SETTLE THEM");
  lines.push("");
  var notedSelectors = {};
  made.proposals
    .slice()
    .sort(function (a, b) {
      return a.valueStart - b.valueStart;
    })
    .forEach(function (p) {
      lines.push("    " + p.selector);
      lines.push("      - " + p.property + ": " + p.from);
      lines.push("      + " + p.property + ": " + p.to);
      // The author's own comment inside the rule, once per rule. It is very
      // often the answer: `.ds-page-header` proposes `padding: 0` and the
      // comment two lines above says the Figma component ships padding 0 while
      // the render carries the inset deliberately. A tool that hides that makes
      // the wrong repair easy.
      if (notedSelectors[p.selector]) return;
      notedSelectors[p.selector] = true;
      var found = R.findRule(css, p.selector);
      var comments = found.rule
        ? found.rule.body.match(/\/\*[\s\S]*?\*\//g) || []
        : [];
      comments.forEach(function (comment) {
        var text = comment
          .replace(/^\/\*+|\*+\/$/g, "")
          .replace(/^\s*\*/gm, "")
          .replace(/\s+/g, " ")
          .trim();
        // A bare value annotation ("16", "0.2") is not a reason, and printing
        // four of them buries the one comment that is.
        if (text && /[a-z]{3}/i.test(text))
          lines.push("      ? the rule says: " + text);
      });
    });
  // One line per distinct reason. A refusal is raised per FINDING, so four
  // padding sides in one unreadable shorthand printed the same sentence four
  // times and read as four separate problems.
  var seenRefusals = {};
  made.refused.forEach(function (r) {
    var key = r.selector + "|" + r.reason;
    if (seenRefusals[key]) return;
    seenRefusals[key] = true;
    lines.push("    " + r.selector + "   NOT PROPOSED: " + r.reason);
  });
  lines.push("");
  lines.push(
    "  A disagreement is not a verdict. Before writing: this can mean the CSS " +
      "has the shape wrong, that",
  );
  lines.push(
    "  the render flattened a structure Figma splits across nested frames, or " +
      "that the Figma component",
  );
  lines.push(
    "  itself is off the spacing scale. Copying the capture repairs the first " +
      "one only.",
  );
  lines.push("");
  lines.push("  Apply with:  " + "--write" + "   then `npm run derive:render`.");
  return lines.join("\n");
}

function write(slug, geo, css, tokenMap, targetRel) {
  var rel = targetRel || BASE_CSS_REL;
  var mine = geo.mismatches.filter(function (m) {
    return m.slug === slug;
  });
  if (!mine.length) return { written: 0, message: slug + ": nothing to repair." };
  var made = R.proposals({
    css: css,
    tokenMap: tokenMap,
    mismatches: mine,
    expandPadding: G.expandPadding,
  });
  if (!made.proposals.length)
    return {
      written: 0,
      message:
        slug +
        ": " +
        mine.length +
        " disagreements, none of them expressible as a declaration rewrite:\n  " +
        made.refused
          .map(function (r) {
            return r.selector + ": " + r.reason;
          })
          .join("\n  "),
    };
  var applied = R.apply(css, made.proposals);
  var target = path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel);
  fs.writeFileSync(target, applied.css);

  // Read the file back and confirm every new value is IN it. A rewrite that
  // silently no-ops writes the file unchanged, the suite then passes on the old
  // code, and the run reports success.
  var after = fs.readFileSync(target, "utf8");
  var missing = applied.applied.filter(function (p) {
    return after.indexOf(p.property + ": " + p.to) === -1;
  });
  if (missing.length)
    throw new Error(
      "geometry-repair wrote " +
        rel +
        " but " +
        missing.length +
        " of its own edits are not in the file it wrote: " +
        missing
          .map(function (p) {
            return p.selector + " {" + p.property + "}";
          })
          .join(", "),
    );
  var notes = (applied.staleNotes || []).map(function (n) {
    return (
      "  ! " +
      n.selector +
      " {" +
      n.property +
      "} still carries " +
      n.comment.replace(/\s+/g, " ") +
      ", which now states the old number"
    );
  });
  return {
    written: applied.applied.length,
    staleNotes: applied.staleNotes || [],
    message:
      slug +
      ": rewrote " +
      applied.applied.length +
      " declaration(s) in " +
      rel +
      ".\n" +
      (notes.length ? notes.join("\n") + "\n" : "") +
      "  Re-run `npm run derive:render` and check the count fell. Look at " +
      "the render before committing.",
  };
}

module.exports = {
  patternReach: patternReach,
  composition: composition,
  rootClassOf: rootClassOf,
  worklist: worklist,
  explain: explain,
  write: write,
  BASE_CSS_REL: BASE_CSS_REL,
};

if (require.main === module) {
  var argv = process.argv.slice(2);
  var slug = argv.filter(function (a) {
    return a.indexOf("--") !== 0;
  })[0];
  var wantsWrite = argv.indexOf("--write") !== -1;

  var css = fs.readFileSync(path.join(REPO_ROOT, BASE_CSS_REL), "utf8");
  var tokenMap = A.loadTokenMap(D.deriveCanonical().css);
  // Measured live rather than read from the committed report, so the view can
  // never be a stale artifact's opinion of a stylesheet that has since moved.
  var geo = GEO.measureGeometry();
  var colour = readJson("components/render/dist/fidelity-report.json");
  var reach = patternReach();

  if (!slug) {
    process.stdout.write(worklist(geo, colour, reach) + "\n");
  } else if (wantsWrite) {
    var r = write(slug, geo, css, tokenMap);
    process.stdout.write(r.message + "\n");
  } else {
    process.stdout.write(explain(slug, geo, colour, reach, css, tokenMap) + "\n");
  }
}
