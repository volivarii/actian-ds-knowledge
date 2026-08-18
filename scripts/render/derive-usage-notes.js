"use strict";
// derive-usage-notes.js: derive a concise, honest usage note per component from
// the guideline domains. Consumer-agnostic markdown: Claude Design embeds it in
// the card, and the plugin/docs consume the same file. This is the guidance tier
// of the North Star (slice 2). build-bundle.js also writes this same markdown as
// a "<slug>.prompt.md" sibling of "<slug>.html", which Claude Design reads as
// that card's usage-notes/generation grounding (confirmed empirically: the
// dogfood project's button and calendar cards each carry a hand-pasted
// .prompt.md matching this generator's own output shape).

var fs = require("node:fs");
var path = require("node:path");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var GUIDELINES_DIR = path.join(REPO_ROOT, "components", "dist", "guidelines");
var CATEGORIES_DIR = path.join(REPO_ROOT, "components", "dist", "categories");

// The dist paths this producer READS. render-derive.yml must watch every one of
// them, and tests/render/derive-usage-notes.test.js asserts that it does. Same
// contract as derive-contract.js INPUTS: a trigger list nobody checks rots, and
// this producer has no committed-vs-fresh drift guard to catch it when it does.
var INPUTS = ["components/dist/guidelines/", "components/dist/categories/"];

// A rename or a retirement moves a handful of slugs. Anything bulk is a broken
// input, and the cost of stopping is one reviewed commit raising this number,
// against a silent tagged-and-vendored deletion if it is wrong.
var PRUNE_CEILING = 10;

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
  // No category declared is a real state and yields no rationale.
  if (!category) return "";
  var raw;
  try {
    raw = fs.readFileSync(path.join(CATEGORIES_DIR, category + ".md"), "utf8");
  } catch (e) {
    // A DECLARED category that will not read is a broken input, and swallowing it
    // is worse here than for guidelines, because the loss is a REWRITE rather than
    // a deletion: the note simply loses its "## Category guidance" section, still
    // passes hasBody, is rewritten, and gets bumped, tagged and vendored on a green
    // run. Neither the empty-set guard nor PRUNE_CEILING sees a rewrite, and 59 of
    // the 60 notes carry that section, so a half-written categories dist would
    // quietly strip it from nearly all of them.
    throw new Error(
      "derive-usage-notes: category " + category + ".md is unreadable: " + e.message,
    );
  }
  var parts = raw.split(/\n---\n/);
  var body = parts.length > 1 ? parts.slice(1).join("\n---\n") : raw;
  return clean(body);
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

// Every slug the guidelines dist holds, which is NOT the same as the slugs that
// emit a note: `chat-with-ai-steward` is a real guideline whose prose is too thin
// to pass hasBody. That difference is why the prune keys on this and not on the
// emitted set, see pruneNotes.
function guidelineSlugs() {
  return fs
    .readdirSync(GUIDELINES_DIR)
    .filter(function (f) {
      // Per-component docs only; skip the guidelines.bundle.json roll-up.
      return f.endsWith(".json") && !f.endsWith(".bundle.json");
    })
    .map(function (f) {
      return path.basename(f, ".json");
    })
    .sort();
}

function deriveAll(opts) {
  var out = {};
  guidelineSlugs().forEach(function (slug) {
    var doc;
    try {
      doc = JSON.parse(
        fs.readFileSync(path.join(GUIDELINES_DIR, slug + ".json"), "utf8"),
      );
    } catch (e) {
      // Previously this was a skipped slug on stderr. It cannot be: the caller
      // prunes, and a swallowed parse error would turn one corrupt input into a
      // deleted, committed, tagged and vendored note. A guideline that will not
      // parse is a broken input, not a component without guidance.
      throw new Error(
        "derive-usage-notes: " + slug + ".json is unreadable: " + e.message,
      );
    }
    var note = usageNote(doc, opts);
    if (hasBody(note)) out[slug] = note;
  });
  return out;
}

// Delete notes for slugs the guidelines dist no longer holds. Without this the producer
// only ever writes, so a rename leaves a fossil no regeneration can reach:
// usage-notes/radio-button.md survived the radio-button -> radio rename in #438
// and was still asserting "DRAFT (usage)" after #566 made that false, tracked and
// shipped, for a month. Same shape as #520.
//
// Takes outDir explicitly so it can be tested against a temp directory. The CLI
// block below hardcodes REPO_ROOT, and a prune driven at the real tree is how 179
// committed anatomy files were once deleted by a test.
function pruneNotes(outDir, knownSlugs) {
  // knownSlugs is the set of slugs the guidelines dist HOLDS, never the set that
  // emitted a note. A guideline whose prose is momentarily too thin, or truncated
  // by a bad write, emits nothing; keying on the emitted set would delete its
  // shipped note, bump, tag and vendor the deletion, with a green run throughout.
  // The only thing that should remove a note is its guideline disappearing.
  //
  // An empty set means the input is missing, not that every note should go. That
  // distinction is the difference between a no-op and a silent wipe.
  if (!knownSlugs.length) throw new Error("pruneNotes: refusing to prune against an empty slug set");
  var keep = Object.create(null);
  knownSlugs.forEach(function (s) {
    keep[s + ".md"] = true;
  });
  var doomed = fs.readdirSync(outDir).filter(function (f) {
    return f.endsWith(".md") && !keep[f];
  });
  // Zero known slugs is the only TOTAL loss, and refusing at exactly zero leaves
  // the realistic case open: a partial guidelines dist, say 3 of 61 JSONs after a
  // bad checkout or a half-finished upstream derive, still looks like 58 slugs
  // being retired at once. render-derive.yml would bump, commit, tag and vendor
  // that. A real removal moves a handful of slugs; anything bulk is a broken
  // input until a human says otherwise. Same threshold and the same "assume
  // something went wrong" reading as the sync's ten-removals-per-category stop.
  if (doomed.length > PRUNE_CEILING) {
    throw new Error(
      "pruneNotes: refusing to delete " + doomed.length + " notes in one run " +
        "(ceiling " + PRUNE_CEILING + "). This is a partial or broken guidelines dist, " +
        "not a retirement. Slugs: " + doomed.join(", "),
    );
  }
  return doomed
    .map(function (f) {
      fs.unlinkSync(path.join(outDir, f));
      return f;
    });
}

if (require.main === module) {
  // `--strict` is a measurement mode: it drops every non-approved domain, so its
  // output is a different artifact from the committed dist, which is the
  // permissive one. It used to write that different artifact straight into the
  // shipped directory. Nothing in package.json or CI passes the flag, so the only
  // way to reach that was a human running it by hand and silently clobbering 60
  // vendored notes. It reports now and writes nothing.
  var strict = process.argv.indexOf("--strict") >= 0;
  var all = deriveAll({ strict: strict });
  var slugs = Object.keys(all);
  if (strict) {
    process.stdout.write(
      "--strict: " + slugs.length + " note(s) would be emitted. Reporting only; " +
        "the committed dist is the permissive output and is not written.\n",
    );
    return;
  }

  var outDir = path.join(
    REPO_ROOT,
    "components",
    "render",
    "dist",
    "usage-notes",
  );
  // The guidelines dist is what the prune keys on, not the emitted set. A slug
  // that exists but yields no note (chat-with-ai-steward today) must keep whatever
  // is committed for it; only a slug that has GONE should lose its note.
  var known = guidelineSlugs();
  if (!known.length) {
    // Reachable only as "the directory exists and holds no per-component JSON".
    // A missing directory throws out of readdirSync inside deriveAll above, long
    // before here, which is the louder failure and the right one.
    process.stderr.write(
      "derive-usage-notes: components/dist/guidelines holds no per-component JSON; " +
        "refusing to write or prune.\n",
    );
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  slugs.forEach(function (slug) {
    fs.writeFileSync(path.join(outDir, slug + ".md"), all[slug] + "\n");
  });
  var pruned = pruneNotes(outDir, known);
  process.stdout.write(
    "wrote " + slugs.length + " usage note(s) -> " + outDir + "\n",
  );
  // A guideline that stops emitting keeps its committed note, deliberately: that
  // is what makes the prune safe. But it also means the shipped note freezes at
  // its old content with nothing saying so, which is the fossil this file exists
  // to prevent, in a quieter flavour. Name them.
  var silent = known.filter(function (s) {
    return slugs.indexOf(s) < 0;
  });
  if (silent.length) {
    process.stdout.write(
      "no note emitted for " + silent.length + " known slug(s): " + silent.join(", ") + "\n",
    );
    // Only some of those actually have a committed note to keep. Saying "copy
    // kept" for a slug with no file would be this diagnostic asserting the very
    // kind of phantom it was added to help spot.
    var frozen = silent.filter(function (s) {
      return fs.existsSync(path.join(outDir, s + ".md"));
    });
    if (frozen.length) {
      process.stdout.write(
        "  committed note kept and NOT refreshed for: " + frozen.join(", ") + "\n",
      );
    }
  }
  if (pruned.length) {
    process.stdout.write("pruned " + pruned.length + ": " + pruned.join(", ") + "\n");
  }
}

module.exports = {
  usageNote: usageNote,
  pruneNotes: pruneNotes,
  guidelineSlugs: guidelineSlugs,
  INPUTS: INPUTS,
  deriveAll: deriveAll,
  clean: clean,
  sections: sections,
  categoryBody: categoryBody,
  GUIDELINES_DIR: GUIDELINES_DIR,
  REPO_ROOT: REPO_ROOT,
};
