"use strict";

// build-bundle.js — assemble the DesignSync @dsCard bundle from the canonical
// render dist + the DTCG tokens.
//
// buildBundle(outDir) writes, one self-contained @dsCard HTML document per file:
//   <Group>/<slug>.html     — the canonical component render (marker intact).
//   Colors/palette.html     — a swatch grid of the resolved color tokens.
//   Type/type.html          — the type scale and families.
//   Spacing/spacing.html    — the spacing scale as labeled bars.
//   styles.css              — the fonts and render.css, the system's stylesheet.
// Returns { written, assets }: written is the list of relative paths written
// (DesignSync compiles the @dsCard markers into _ds_manifest.json and reads the
// files from disk, so the bundle is exactly this directory of grouped cards);
// assets is the {name, path, group, subtitle} list for DesignSync's legacy
// register_assets call.
//
// Two things Claude Design's self-check reads, verified against the dogfood
// project on 2026-09-24 with a probe card and a probe stylesheet:
//   - The marker's name and subtitle. The compiled index keeps `name`,
//     `subtitle` and `viewport` from `<!-- @dsCard group=".." name=".." ... -->`.
//     register_assets changed nothing on this project (its manifest is
//     `source: "spa"`), so without them the index held file names only.
//   - A stylesheet at the project root. The index records it in
//     globalCssPaths and extracts its custom properties as the system's tokens
//     and its @font-face rules as its fonts. With none, the index held no
//     tokens and no fonts, although every card carries both inline.
// The probe's stylesheet declared its properties in one plain `:root` block.
// This one declares them in `:root, [data-theme="actian"]` plus a studio and an
// explorer override block; how the index reads that is known only from a
// manifest read after pushing it.

var fs = require("node:fs");
var path = require("node:path");

var deriveCanonical = require("./derive-canonical.js").deriveCanonical;
var deriveFromFile = require("./derive-dtcg.js").deriveFromFile;
var usageNote = require("./derive-usage-notes.js").usageNote;
var GUIDELINES_DIR = require("./derive-usage-notes.js").GUIDELINES_DIR;

var REPO_ROOT = path.resolve(__dirname, "..", "..");

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Resolve a DTCG value: follow "{group.path}" alias references through the tree
// to a concrete value. Bounded so a malformed cycle cannot spin.
function resolveValue(tree, value) {
  var guard = 0;
  while (typeof value === "string" && /^\{[^}]+\}$/.test(value) && guard < 12) {
    var dotted = value.slice(1, -1);
    var leaf = dotted.split(".").reduce(function (o, k) {
      return o && o[k];
    }, tree);
    if (leaf && leaf.$value !== undefined) {
      value = leaf.$value;
      guard++;
    } else {
      break;
    }
  }
  return value;
}

// Collect { name, value } leaves of a given $type under a subtree, resolving
// aliases. name is the dotted path below the subtree root.
function collectLeaves(tree, subtree, type) {
  var out = [];
  (function walk(node, trail) {
    if (!node || typeof node !== "object") return;
    if (Object.prototype.hasOwnProperty.call(node, "$value")) {
      if (!type || node.$type === type) {
        out.push({
          name: trail.join("."),
          value: resolveValue(tree, node.$value),
        });
      }
      return;
    }
    Object.keys(node).forEach(function (k) {
      if (k[0] === "$") return;
      walk(node[k], trail.concat(k));
    });
  })(subtree, []);
  return out;
}

var PAGE_CSS = [
  "body{margin:0;padding:24px;background:#fff;color:#111;",
  "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
  "h1{font-size:18px;margin:0 0 4px}",
  ".sub{color:#666;font-size:13px;margin:0 0 20px}",
  "h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#888;margin:22px 0 10px}",
  ".grid{display:flex;flex-wrap:wrap;gap:14px}",
  ".sw{width:132px;font-size:12px;line-height:1.4}",
  ".sw .chip{height:52px;border-radius:8px;border:1px solid rgba(0,0,0,.12)}",
  ".sw .nm{margin-top:6px;font-weight:600;word-break:break-all}",
  ".sw .vl{color:#666}",
  ".row{display:flex;align-items:center;gap:14px;margin:8px 0}",
  ".row .lbl{width:150px;color:#444;font-size:13px}",
  ".row .bar{height:16px;background:#94a3b8;border-radius:3px;min-width:2px}",
  ".spec{margin:10px 0;color:#111}",
].join("");

// A humanized fallback name for a component with no guideline doc to name it
// (e.g. "app-switcher-dropdown" -> "App Switcher Dropdown").
function titleCaseSlug(slug) {
  return slug.replace(/(^|-)([a-z])/g, function (_, sep, c) {
    return (sep ? " " : "") + c.toUpperCase();
  });
}

// A short register_assets subtitle: the note's first sentence, capped so it
// reads as a label rather than a paragraph. usageNote()'s own markdown shape
// ("# <component>: usage notes\n\n<intro>...") is what this parses.
function subtitleFromNote(note) {
  if (!note) return "";
  var m = /^# .*: usage notes\n\n([^\n]+)/.exec(note);
  if (!m) return "";
  var firstSentence = m[1].split(/(?<=\.)\s+/)[0];
  return firstSentence.length <= 140
    ? firstSentence
    : firstSentence.slice(0, 137) + "...";
}

var COLORS_SUBTITLE =
  "Actian Product Design System color tokens, resolved to their values.";
var SPACING_SUBTITLE = "The spacing scale, each bar drawn at its token value.";
var TYPE_SUBTITLE = "The type families, weights, and size scale.";

// A marker attribute value: one line, no double quote (it would end the
// attribute) and no "--" (it would end the HTML comment the marker lives in).
function markerValue(s) {
  return String(s)
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .replace(/-{2,}/g, "-")
    .trim();
}

// The first line of every card. name and subtitle are optional: an empty one is
// left out rather than written as an empty attribute.
function dsCardMarker(group, name, subtitle) {
  var attrs = ' group="' + markerValue(group) + '"';
  if (name) attrs += ' name="' + markerValue(name) + '"';
  if (subtitle) attrs += ' subtitle="' + markerValue(subtitle) + '"';
  return "<!-- @dsCard" + attrs + " -->\n";
}

function page(group, title, subtitle, body) {
  return (
    dsCardMarker(group, title, subtitle) +
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<style>" +
    PAGE_CSS +
    "</style></head><body>" +
    "<h1>" +
    esc(title) +
    "</h1>" +
    '<p class="sub">' +
    esc(subtitle) +
    "</p>" +
    body +
    "</body></html>"
  );
}

function colorsCard(dtcg) {
  var groups = Object.keys(dtcg.color || {});
  var sections = groups
    .map(function (g) {
      var leaves = collectLeaves(dtcg, dtcg.color[g], "color").filter(
        function (l) {
          return (
            typeof l.value === "string" && /^#|^(rgb|hsl|oklch)/i.test(l.value)
          );
        },
      );
      if (!leaves.length) return "";
      var swatches = leaves
        .map(function (l) {
          return (
            '<div class="sw"><div class="chip" style="background:' +
            esc(l.value) +
            '"></div>' +
            '<div class="nm">color.' +
            esc(g) +
            "." +
            esc(l.name) +
            "</div>" +
            '<div class="vl">' +
            esc(l.value) +
            "</div></div>"
          );
        })
        .join("");
      return "<h2>" + esc(g) + '</h2><div class="grid">' + swatches + "</div>";
    })
    .join("");
  return page("Colors", "Colors", COLORS_SUBTITLE, sections);
}

function spacingCard(dtcg) {
  var leaves = collectLeaves(dtcg, dtcg.spacing || {}, "dimension");
  var rows = leaves
    .map(function (l) {
      var px = parseFloat(l.value) || 0;
      return (
        '<div class="row"><div class="lbl">spacing.' +
        esc(l.name) +
        " · " +
        esc(l.value) +
        '</div><div class="bar" style="width:' +
        px +
        'px"></div></div>'
      );
    })
    .join("");
  return page("Spacing", "Spacing", SPACING_SUBTITLE, rows);
}

function typeCard(dtcg) {
  var font = dtcg.font || {};
  var families = collectLeaves(dtcg, font.family || {}, null);
  var weights = collectLeaves(dtcg, font.weight || {}, null);
  var sizes = collectLeaves(dtcg, font.size || {}, "dimension");
  var famLine = families
    .map(function (f) {
      return "font.family." + f.name + " = " + f.value;
    })
    .join("  ·  ");
  var wtLine = weights
    .map(function (w) {
      return "font.weight." + w.name + " = " + w.value;
    })
    .join("  ·  ");
  var specimens = sizes
    .map(function (s) {
      var px = parseFloat(s.value) || 14;
      return (
        '<div class="spec" style="font-size:' +
        px +
        'px">Aa Bb Cc &middot; font.size.' +
        esc(s.name) +
        " (" +
        esc(s.value) +
        ")</div>"
      );
    })
    .join("");
  var body =
    "<h2>Families</h2><p>" +
    esc(famLine) +
    "</p><h2>Weights</h2><p>" +
    esc(wtLine) +
    "</p><h2>Scale</h2>" +
    specimens;
  return page("Type", "Type", TYPE_SUBTITLE, body);
}

function writeFile(outDir, rel, contents) {
  var full = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return rel;
}

// Reconstruct a self-contained @dsCard document from the shared stylesheet, the
// page chrome, and a component fragment. This is the on-demand projection of the
// dedup dist: Claude Design needs standalone files, so the bundle re-inlines
// render.css plus the page chrome per card. Both come from the derive (pageCss is
// the derive's own PAGE_CSS constant), so nothing is hardcoded here.
// render.css deliberately excludes the page chrome, because consumers embed
// render.css into their own page and must not inherit this body framing.
// fontsCss is a SEPARATE parameter because render.css no longer carries the
// font payload: it is 336 KB of base64 woff2 that no consumer with its own
// font pipeline should download to show one component. A standalone card is
// exactly the consumer that still needs it, so it inlines both and the
// offline contract ("NO network font loads") is unchanged here.
// meta ({name, subtitle}) is an optional sixth argument, so a five-argument
// caller such as build-contact-sheet.js still gets a card with a group-only
// marker.
function selfContainedCard(css, fontsCss, pageCss, fragment, group, meta) {
  // Arity guard. Inserting a parameter into a 4-argument call shifts every
  // later one silently, and it already happened once: build-contact-sheet.js
  // kept the old call, so pageCss landed here, the fragment landed in pageCss,
  // and every sign-off card emitted group="undefined" with the component markup
  // injected inside <style>. Its test stayed green because it only grepped slug
  // names, which appear in the headings either way. A shifted call now says so.
  if (typeof fontsCss !== "string") {
    throw new TypeError(
      "selfContainedCard(css, fontsCss, pageCss, fragment, group): fontsCss must " +
        "be a string, got " +
        typeof fontsCss +
        ". A 4-argument call is the pre-split signature and its arguments are shifted.",
    );
  }
  meta = meta || {};
  return (
    dsCardMarker(group, meta.name, meta.subtitle) +
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<style>" +
    fontsCss +
    "\n" +
    css +
    "\n" +
    pageCss +
    "</style></head><body>" +
    fragment +
    "</body></html>"
  );
}

function buildBundle(outDir, opts) {
  opts = opts || {};
  var tokensPath =
    opts.tokensPath || path.join(REPO_ROOT, "tokens", "tokens.json");

  var buildNote = opts.usageNote || usageNote;
  var canonical = deriveCanonical();
  var dtcg = deriveFromFile(tokensPath);
  var written = [];
  // register_assets metadata (DesignSync's "legacy" explicit path):
  // {name, path, group, subtitle}. The same name and subtitle also go in each
  // card's marker, which is what the index actually keeps (see the header).
  var assets = [];

  canonical.manifest.renders.forEach(function (r) {
    var doc = null;
    try {
      doc = JSON.parse(
        fs.readFileSync(path.join(GUIDELINES_DIR, r.slug + ".json"), "utf8"),
      );
    } catch (e) {
      doc = null; // a rendered component with no guideline doc simply ships without a note
    }
    // usageNote() is called OUTSIDE that catch, deliberately (#569). The catch
    // was written for the read and the parse above it, where "no guideline doc"
    // is a legitimate state. It also covered the note builder, so a broken
    // components/dist/categories/ would have been converted from "one section
    // missing" into "every affected card ships an empty note and an empty
    // <slug>.prompt.md", silently, on a green run. A producer that cannot build
    // the note it was asked for now fails the run instead.
    //
    // opts.usageNote exists so that placement can be PROVEN: a builder that
    // throws must reach the caller. Re-widening the try above swallows it and
    // the guard goes red.
    var note = doc ? buildNote(doc) : "";
    var htmlRel = path.join(r.group, r.slug + ".html");
    var name = (doc && doc.component) || titleCaseSlug(r.slug);
    var subtitle = subtitleFromNote(note);
    var card = selfContainedCard(
      canonical.css,
      canonical.fontsCss,
      canonical.pageCss,
      canonical.fragments[r.slug],
      r.group,
      { name: name, subtitle: subtitle },
    );
    written.push(writeFile(outDir, htmlRel, card));
    // Claude Design reads a "<slug>.prompt.md" file beside "<slug>.html" as that
    // card's usage-notes / generation grounding (verified against the dogfood
    // project: button.prompt.md and calendar.prompt.md already carried this exact
    // markdown, pasted by hand before this was wired). This is the only place the
    // note ships: it used to also render as a visible <section class="ds-usage">
    // inside the card body, but that duplicated the same content the "Add usage
    // notes" panel already surfaces, and cluttered what should be a clean
    // component preview.
    if (note) {
      written.push(
        writeFile(outDir, path.join(r.group, r.slug + ".prompt.md"), note),
      );
    }
    assets.push({
      name: name,
      path: htmlRel,
      group: r.group,
      subtitle: subtitle,
    });
  });
  // The system's own stylesheet, at the project root: the same fonts and
  // render.css every card already inlines, concatenated in the same order. It
  // adds nothing a card does not carry. It is what lets Claude Design's index
  // record the tokens and fonts, and what a new design can link instead of
  // copying styles out of a card. render.css carries no page chrome by design,
  // so linking it frames nothing.
  written.push(
    writeFile(
      outDir,
      "styles.css",
      canonical.fontsCss + "\n" + canonical.css + "\n",
    ),
  );
  written.push(
    writeFile(outDir, path.join("Colors", "palette.html"), colorsCard(dtcg)),
  );
  assets.push({
    name: "Colors",
    path: path.join("Colors", "palette.html"),
    group: "Colors",
    subtitle: COLORS_SUBTITLE,
  });
  written.push(
    writeFile(outDir, path.join("Type", "type.html"), typeCard(dtcg)),
  );
  assets.push({
    name: "Type",
    path: path.join("Type", "type.html"),
    group: "Type",
    subtitle: TYPE_SUBTITLE,
  });
  written.push(
    writeFile(outDir, path.join("Spacing", "spacing.html"), spacingCard(dtcg)),
  );
  assets.push({
    name: "Spacing",
    path: path.join("Spacing", "spacing.html"),
    group: "Spacing",
    subtitle: SPACING_SUBTITLE,
  });
  return { written: written, assets: assets };
}

if (require.main === module) {
  var outArgIdx = process.argv.indexOf("--out");
  var outDir =
    outArgIdx >= 0 && process.argv[outArgIdx + 1]
      ? path.resolve(process.argv[outArgIdx + 1])
      : path.join(REPO_ROOT, "components", "render", "dist", "bundle");
  var result = buildBundle(outDir);
  process.stdout.write("bundle -> " + outDir + "\n");
  result.written.forEach(function (rel) {
    process.stdout.write("  " + rel + "\n");
  });
}

module.exports = {
  buildBundle: buildBundle,
  resolveValue: resolveValue,
  collectLeaves: collectLeaves,
  selfContainedCard: selfContainedCard,
  dsCardMarker: dsCardMarker,
  titleCaseSlug: titleCaseSlug,
  subtitleFromNote: subtitleFromNote,
};
