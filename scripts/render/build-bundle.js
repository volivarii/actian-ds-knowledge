"use strict";

// build-bundle.js — assemble the DesignSync @dsCard bundle from the canonical
// render dist + the DTCG tokens.
//
// buildBundle(outDir) writes, one self-contained @dsCard HTML document per file:
//   Components/<slug>.html  — the canonical component render (marker intact).
//   Colors/palette.html     — a swatch grid of the resolved color tokens.
//   Type/type.html          — the type scale and families.
//   Spacing/spacing.html    — the spacing scale as labeled bars.
// It returns the list of relative paths written. DesignSync compiles the markers
// into _ds_manifest.json and reads the files from disk, so the bundle is exactly
// this directory of grouped cards.

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

function page(group, title, subtitle, body) {
  return (
    '<!-- @dsCard group="' +
    group +
    '" -->\n' +
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
  return page(
    "Colors",
    "Colors",
    "Actian Product Design System color tokens, resolved to their values.",
    sections,
  );
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
  return page(
    "Spacing",
    "Spacing",
    "The spacing scale, each bar drawn at its token value.",
    rows,
  );
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
  return page(
    "Type",
    "Type",
    "The type families, weights, and size scale.",
    body,
  );
}

function writeFile(outDir, rel, contents) {
  var full = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return rel;
}

// Minimal, note-shaped markdown to HTML: #/## headings, - bullets, > blockquote,
// **bold**, paragraphs. Escapes text first (reusing esc), then re-applies bold.
function noteToHtml(md) {
  var lines = String(md).split("\n");
  var html = [];
  var inList = false;
  var closeList = function () {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  var inline = function (t) {
    return esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  };
  lines.forEach(function (raw) {
    var line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      closeList();
      return;
    }
    var h1 = /^#\s+(.*)/.exec(line);
    var h2 = /^##\s+(.*)/.exec(line);
    var li = /^[-*]\s+(.*)/.exec(line);
    var bq = /^>\s+(.*)/.exec(line);
    if (h2) {
      closeList();
      html.push("<h4>" + inline(h2[1]) + "</h4>");
    } else if (h1) {
      closeList();
      html.push("<h3>" + inline(h1[1]) + "</h3>");
    } else if (li) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push("<li>" + inline(li[1]) + "</li>");
    } else if (bq) {
      closeList();
      html.push("<blockquote>" + inline(bq[1]) + "</blockquote>");
    } else {
      closeList();
      html.push("<p>" + inline(line) + "</p>");
    }
  });
  closeList();
  return html.join("");
}

var USAGE_CSS =
  ".ds-usage{max-width:640px;margin:32px 24px 0;padding-top:24px;" +
  "border-top:1px solid rgba(0,0,0,.12);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111}" +
  ".ds-usage h3{font-size:15px;margin:0 0 12px}" +
  ".ds-usage h4{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#888;margin:18px 0 6px}" +
  ".ds-usage ul{margin:0;padding-left:20px}.ds-usage li{margin:4px 0;font-size:13px;line-height:1.5}" +
  ".ds-usage p{font-size:13px;line-height:1.5;margin:8px 0}" +
  ".ds-usage blockquote{margin:16px 0 0;padding:8px 12px;background:#f6f7f9;border-radius:6px;" +
  "font-size:12px;color:#555}";

// Inject the note (as HTML) plus its scoped CSS before </body> of a render doc.
function embedUsage(renderHtml, noteMd) {
  if (!noteMd) return renderHtml;
  var section =
    "<style>" +
    USAGE_CSS +
    "</style>" +
    '<section class="ds-usage">' +
    noteToHtml(noteMd) +
    "</section>";
  return renderHtml.replace("</body>", section + "</body>");
}

// Reconstruct a self-contained @dsCard document from the shared stylesheet, the
// page chrome, and a component fragment. This is the on-demand projection of the
// dedup dist: Claude Design needs standalone files, so the bundle re-inlines
// render.css plus the page chrome per card. Both come from the derive (pageCss is
// the derive's own PAGE_CSS constant), so nothing is hardcoded here.
// render.css deliberately excludes the page chrome, because consumers embed
// render.css into their own page and must not inherit this body framing.
function selfContainedCard(css, pageCss, fragment, group) {
  return (
    '<!-- @dsCard group="' +
    group +
    '" -->\n' +
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<style>" +
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

  var canonical = deriveCanonical();
  var dtcg = deriveFromFile(tokensPath);
  var written = [];

  canonical.manifest.renders.forEach(function (r) {
    var note = "";
    try {
      var doc = JSON.parse(
        fs.readFileSync(path.join(GUIDELINES_DIR, r.slug + ".json"), "utf8"),
      );
      note = usageNote(doc);
    } catch (e) {
      note = ""; // a rendered component with no guideline doc simply ships without a note
    }
    var card = selfContainedCard(
      canonical.css,
      canonical.pageCss,
      canonical.fragments[r.slug],
      r.group,
    );
    written.push(
      writeFile(
        outDir,
        path.join(r.group, r.slug + ".html"),
        embedUsage(card, note),
      ),
    );
  });
  written.push(
    writeFile(outDir, path.join("Colors", "palette.html"), colorsCard(dtcg)),
  );
  written.push(
    writeFile(outDir, path.join("Type", "type.html"), typeCard(dtcg)),
  );
  written.push(
    writeFile(outDir, path.join("Spacing", "spacing.html"), spacingCard(dtcg)),
  );
  return written;
}

if (require.main === module) {
  var outArgIdx = process.argv.indexOf("--out");
  var outDir =
    outArgIdx >= 0 && process.argv[outArgIdx + 1]
      ? path.resolve(process.argv[outArgIdx + 1])
      : path.join(REPO_ROOT, "components", "render", "dist", "bundle");
  var written = buildBundle(outDir);
  process.stdout.write("bundle -> " + outDir + "\n");
  written.forEach(function (rel) {
    process.stdout.write("  " + rel + "\n");
  });
}

module.exports = {
  buildBundle: buildBundle,
  resolveValue: resolveValue,
  collectLeaves: collectLeaves,
  selfContainedCard: selfContainedCard,
};
