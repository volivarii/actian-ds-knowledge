"use strict";
// derive-usage-notes.js: derive a concise, honest usage note per component from
// the guideline domains. Consumer-agnostic markdown: Claude Design embeds it in
// the card, and the plugin/docs consume the same file. This is the guidance tier
// of the North Star (slice 2). Delivery to Claude Design's native notes field is
// not possible programmatically, so consumers embed or paste this markdown.

var fs = require("node:fs");
var path = require("node:path");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var GUIDELINES_DIR = path.join(REPO_ROOT, "components", "dist", "guidelines");
var CATEGORIES_DIR = path.join(REPO_ROOT, "components", "dist", "categories");

var PERMISSIVE = ["approved", "draft", "inherited", "synthesized"];
var STRICT = ["approved"];

// Strip doc-renderer JSX embeds, any other tags, and [text](ref) link markup.
function clean(md) {
  return String(md || "")
    .replace(/<Media[^>]*\/>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\r/g, "")
    .trim();
}

// Parse a markdown body into { headingLowercased: text }. "_intro" holds any text
// before the first heading.
function sections(md) {
  var out = { _intro: "" };
  var cur = "_intro";
  clean(md)
    .split("\n")
    .forEach(function (line) {
      var h = /^#{1,3}\s+(.*)/.exec(line);
      if (h) {
        cur = h[1].trim().toLowerCase();
        out[cur] = out[cur] || "";
      } else {
        out[cur] = (out[cur] || "") + line + "\n";
      }
    });
  return out;
}

function bullets(text) {
  return String(text || "")
    .split("\n")
    .map(function (l) {
      return l.trim();
    })
    .filter(function (l) {
      return /^[*-]\s+/.test(l);
    })
    .map(function (l) {
      return l.replace(/^[*-]\s+/, "").trim();
    })
    .filter(Boolean);
}

// The first prose paragraph (consecutive non-bullet, non-blockquote lines) joined.
function firstPara(text) {
  var lines = String(text || "")
    .split("\n")
    .map(function (s) {
      return s.trim();
    });
  var para = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var isProse = l && !/^[*-]/.test(l) && !/^>/.test(l);
    if (isProse) para.push(l);
    else if (para.length) break;
  }
  return para.join(" ");
}

function dedupe(arr) {
  var seen = {};
  return arr.filter(function (x) {
    var k = x
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  });
}

// Inherited domains carry no prose; resolve the category rationale (derive-guidelines
// L17: "inherited -> consumers resolve from category-defaults"), keyed by category.
function categoryBody(category) {
  if (!category) return "";
  try {
    var raw = fs.readFileSync(
      path.join(CATEGORIES_DIR, category + ".md"),
      "utf8",
    );
    var parts = raw.split(/\n---\n/);
    var body = parts.length > 1 ? parts.slice(1).join("\n---\n") : raw;
    return clean(body);
  } catch (e) {
    return "";
  }
}

function usageNote(doc, opts) {
  opts = opts || {};
  var include = opts.strict ? STRICT : opts.include || PERMISSIVE;
  var D = doc.domains || {};
  var category =
    (doc.meta && doc.meta.category) || (doc._meta && doc._meta.category);

  var ok = function (name) {
    var dom = D[name] || {};
    return include.indexOf(dom.status) >= 0 && (dom.markdown || "").trim();
  };
  var isInherited = function (name) {
    return (
      (D[name] || {}).status === "inherited" &&
      include.indexOf("inherited") >= 0
    );
  };
  var draftUsed = [];
  var synthUsed = [];
  var markStatus = function (name) {
    var s = (D[name] || {}).status;
    if (s === "draft") draftUsed.push(name);
    if (s === "synthesized") synthUsed.push(name);
  };

  var intro = "";
  var whenTo = [];
  var whenNot = [];
  var style = [];
  var design = "";
  var behavior = "";

  if (ok("content")) {
    var c = sections(D.content.markdown);
    // The content domain opens with an H1 title, so its lead paragraph lands under
    // that heading, not before it (_intro stays empty). Take the first prose
    // paragraph of the cleaned content body with heading lines stripped.
    intro = firstPara(clean(D.content.markdown).replace(/^#.*$/gm, ""));
    whenTo = whenTo.concat(bullets(c["when to use"]));
    style = style.concat(bullets(c["style"]));
    markStatus("content");
  }
  if (ok("usage")) {
    var u = sections(D.usage.markdown);
    whenTo = whenTo.concat(bullets(u["when to use"]));
    whenNot = whenNot.concat(bullets(u["when not to use"]));
    markStatus("usage");
  }
  if (ok("design")) {
    var dg = sections(D.design.markdown);
    design = firstPara(dg["anatomy"]) || firstPara(dg._intro);
    markStatus("design");
  }
  if (ok("behavior")) {
    behavior = firstPara(clean(D.behavior.markdown).replace(/^#.*$/gm, ""));
    markStatus("behavior");
  }

  var inheritedUsed = [];
  ["content", "usage", "design", "behavior"].forEach(function (name) {
    if (isInherited(name)) inheritedUsed.push(name);
  });
  var inheritedNote = "";
  if (inheritedUsed.length) {
    var cs = sections(categoryBody(category));
    inheritedNote = [firstPara(cs._intro), firstPara(cs["why these defaults"])]
      .filter(Boolean)
      .join(" ");
  }

  whenTo = dedupe(whenTo).slice(0, 7);
  whenNot = dedupe(whenNot).slice(0, 4);
  style = dedupe(style).slice(0, 5);

  var out = [];
  out.push("# " + (doc.component || doc.slug) + ": usage notes");
  if (intro) out.push("\n" + intro);
  if (whenTo.length) {
    out.push("\n## When to use");
    whenTo.forEach(function (b) {
      out.push("- " + b);
    });
  }
  if (whenNot.length) {
    out.push("\n## When not to use");
    whenNot.forEach(function (b) {
      out.push("- " + b);
    });
  }
  if (style.length) {
    out.push("\n## Style");
    style.forEach(function (b) {
      out.push("- " + b);
    });
  }
  if (design) out.push("\n## Design\n" + design);
  if (behavior) out.push("\n## Behavior\n" + behavior);
  if (inheritedNote) {
    out.push(
      "\n## Category guidance (inherited: " +
        dedupe(inheritedUsed).join(", ") +
        ")\n" +
        inheritedNote,
    );
  }

  var caveats = [];
  if (draftUsed.length)
    caveats.push("DRAFT (" + dedupe(draftUsed).join(", ") + ")");
  if (inheritedUsed.length) {
    caveats.push(
      "INHERITED from category (" + dedupe(inheritedUsed).join(", ") + ")",
    );
  }
  if (synthUsed.length) {
    caveats.push("SYNTHESIZED (" + dedupe(synthUsed).join(", ") + ")");
  }
  if (caveats.length) {
    out.push(
      "\n> Note: includes guidance not yet ratified: " +
        caveats.join("; ") +
        ".",
    );
  }

  return out.join("\n");
}

// A note is worth emitting only when it has at least one section beyond the title.
function hasBody(note) {
  return /\n## /.test(note);
}

function deriveAll(opts) {
  var out = {};
  fs.readdirSync(GUIDELINES_DIR)
    .filter(function (f) {
      // Per-component docs only; skip the guidelines.bundle.json roll-up.
      return f.endsWith(".json") && !f.endsWith(".bundle.json");
    })
    .sort()
    .forEach(function (f) {
      var slug = path.basename(f, ".json");
      var doc;
      try {
        doc = JSON.parse(fs.readFileSync(path.join(GUIDELINES_DIR, f), "utf8"));
      } catch (e) {
        process.stderr.write("skip " + slug + " (unreadable guideline)\n");
        return;
      }
      var note = usageNote(doc, opts);
      if (hasBody(note)) out[slug] = note;
    });
  return out;
}

if (require.main === module) {
  var strict = process.argv.indexOf("--strict") >= 0;
  var all = deriveAll({ strict: strict });
  var outDir = path.join(
    REPO_ROOT,
    "components",
    "render",
    "dist",
    "usage-notes",
  );
  fs.mkdirSync(outDir, { recursive: true });
  Object.keys(all).forEach(function (slug) {
    fs.writeFileSync(path.join(outDir, slug + ".md"), all[slug] + "\n");
  });
  process.stdout.write(
    "wrote " + Object.keys(all).length + " usage note(s) -> " + outDir + "\n",
  );
}

module.exports = {
  usageNote: usageNote,
  deriveAll: deriveAll,
  clean: clean,
  sections: sections,
  categoryBody: categoryBody,
  GUIDELINES_DIR: GUIDELINES_DIR,
  REPO_ROOT: REPO_ROOT,
};
