"use strict";

// Whether a slug rename can be absorbed, i.e. whether calling it additive will
// produce a PR that can actually merge.
//
// WHY THIS EXISTS
//
// components/dist/identity.json makes RESOLUTION survive a rename: a consumer
// holding the old slug still resolves. It does NOT make authored references
// correct, and several authored files are keyed by slug:
//
//   ds-html-map.js has `case "sticky-footer":`, which must become
//   `case "action-bar":` by hand. Teaching a gate to tolerate it would ship a
//   renderer that cannot draw the new slug.
//
//   app-context patterns list slugs in `components[]`, and derive-graph THROWS
//   on a reference matching no registry key rather than dropping the edge.
//
// So an additive verdict on such a rename opens an auto-merge-enabled PR whose
// required checks can never go green. That is strictly WORSE than the breaking
// path it replaces, because a breaking verdict produces a rolling tracking issue
// that a human acts on.
//
// 🪤 Four gates were found one at a time (anatomy, guideline reachability,
// render invariants, the graph) and there was no reason to think the list ended.
// This is the general form: rather than teach gate N+1 about the ledger, assert
// the PRECONDITION that makes all of them pass, which is that nothing authored
// still names the retired slug.

var fs = require("node:fs");
var path = require("node:path");

// The authored surfaces keyed by slug. Each entry names the gate it fails, so a
// reader can tell whether a new surface belongs here. A `glob` entry is a
// directory whose files are all scanned.
//
// This list is authored and therefore rots, so a test asserts every path still
// exists: a surface that moved would make this scan nothing and wave every
// rename through, which is the false all-clear it exists to prevent.
var AUTHORED_SURFACES = [
  {
    path: "components/render/renderer/html-renderers/ds-html-map.js",
    why: "case labels feed RENDER_SLUGS; fragment-invariants invariant 5 fails when a slug is missing from every registry",
  },
  {
    path: "components/render/renderer/html-renderers/fm-html-map.js",
    why: "same switch shape for the FM tier",
  },
  {
    path: "app-context/src/patterns",
    glob: true,
    why: "components[] entries; derive-graph THROWS on a reference matching no registry key",
  },
  {
    path: "components/src/categories",
    glob: true,
    why: "category defaults name component slugs",
  },
];

function filesFor(repoRoot, surface) {
  var full = path.join(repoRoot, surface.path);
  if (!fs.existsSync(full)) return [];
  if (!surface.glob) return [full];
  return fs
    .readdirSync(full)
    .filter(function (f) {
      return /\.(md|ya?ml|json|js)$/.test(f);
    })
    .sort()
    .map(function (f) {
      return path.join(full, f);
    });
}

// Whole-token match. A substring match would let `card-for-items` block `card`,
// making every short slug permanently unabsorbable. Slugs are kebab-case, so the
// boundary is any character that is not a slug character.
function mentions(text, slug) {
  var escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^A-Za-z0-9-])" + escaped + "([^A-Za-z0-9-]|$)").test(
    text,
  );
}

// ---------------------------------------------------------------------------
// #562: scan STRUCTURE, not raw text.
//
// The rationale above is entirely about STRUCTURED references: a `case` label
// feeds RENDER_SLUGS, a components[] entry makes derive-graph throw. Prose
// fails neither gate, so blocking on a prose mention prevents nothing and
// makes every future rename harder. Worse, it penalises the habit this repo
// wants: the more carefully somebody writes up a migration, the more firmly
// they block the thing they are documenting.
//
// 🔑 The lists below are of PROSE, never of slug-bearing fields. An
// unrecognised key is still scanned and still blocks. Getting that polarity
// backwards would turn a new slug-bearing field into a silent all-clear, which
// is the single failure this module exists to prevent.

// Frontmatter keys whose values are sentences. A slug inside one is being
// talked ABOUT, not referenced.
var PROSE_KEYS = ["description", "note", "when", "label", "summary", "why"];

// Comments are commentary, including commentary about a past rename. The case
// labels are the code and still count.
function stripJsComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// The frontmatter block, or null when there is none. Null means the caller
// falls back to scanning everything, because unknown must not read as absent.
function frontmatterOf(text) {
  var m = /^---\n([\s\S]*?)\n---/.exec(text);
  return m ? m[1] : null;
}

// Blank the VALUES of prose keys, leaving every other line intact.
//
// Line-based rather than one regex on purpose: a block scalar's continuation
// is "the following lines indented deeper than its key", and a regex that
// guesses the extent can swallow the NEXT key. Swallowing a structured field
// is a false all-clear, so the rule is written to be readable rather than
// short.
function stripProseValues(yaml) {
  var proseKey = new RegExp("^(\\s*)(?:-\\s*)?(" + PROSE_KEYS.join("|") + "):");
  // An inline flow map: `- { ref: x, note: a sentence, possibly quoted }`.
  var inlineProse = new RegExp(
    "\\b(" +
      PROSE_KEYS.join("|") +
      "):\\s*(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|[^,}\\n]*)",
    "g",
  );
  var lines = yaml.split("\n");
  var out = [];
  var blockIndent = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (blockIndent !== null) {
      var indent = line.match(/^\s*/)[0].length;
      // A blank line inside a block scalar belongs to it; anything indented no
      // deeper than the key ends it.
      if (line.trim() === "" || indent > blockIndent) {
        out.push("");
        continue;
      }
      blockIndent = null;
    }
    var m = proseKey.exec(line);
    if (m) {
      blockIndent = m[1].length;
      out.push("");
      continue;
    }
    out.push(line.replace(inlineProse, "$1:"));
  }
  return out.join("\n");
}

// What of a file is a slug REFERENCE rather than a sentence about one.
function scannableText(file, text) {
  if (/\.js$/.test(file)) return stripJsComments(text);
  if (/\.md$/.test(file)) {
    var fm = frontmatterOf(text);
    // No frontmatter is a shape this module does not understand, so it degrades
    // to the old whole-text scan and blocks rather than clearing.
    if (fm === null) return text;
    return stripProseValues(fm);
  }
  return text;
}

// Authored files that still name `slug`. Empty means the rename is absorbable.
function authoredReferences(repoRoot, slug) {
  var hits = [];
  AUTHORED_SURFACES.forEach(function (surface) {
    filesFor(repoRoot, surface).forEach(function (file) {
      var text;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch (e) {
        // Unreadable means unknown, and unknown must not read as absent: an
        // unreadable surface blocks absorption rather than clearing it.
        hits.push({ file: file, why: "unreadable: " + e.message });
        return;
      }
      if (mentions(scannableText(file, text), slug))
        hits.push({ file: file, why: surface.why });
    });
  });
  return hits;
}

// The renames a run may absorb, filtered down from every rename it detected.
// Returns { absorbable, blocked } so the caller can report WHY a rename it might
// have absorbed stayed breaking.
function absorbable(repoRoot, renameIndex) {
  var out = {};
  var blocked = {};
  Object.keys(renameIndex || {}).forEach(function (from) {
    var refs = authoredReferences(repoRoot, from);
    if (refs.length === 0) out[from] = renameIndex[from];
    else blocked[from] = refs;
  });
  return { absorbable: out, blocked: blocked };
}

module.exports = {
  AUTHORED_SURFACES: AUTHORED_SURFACES,
  PROSE_KEYS: PROSE_KEYS,
  scannableText: scannableText,
  authoredReferences: authoredReferences,
  absorbable: absorbable,
  mentions: mentions,
};
