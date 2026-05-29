"use strict";

// AST traversal helpers for the foundations source (per-section files under
// foundations/src/, concatenated at derive time).
//
// Two modes coexist here:
//
//   1. Legacy numbered-heading lookup (`findNumberedHeadings` /
//      `sliceSectionContent`) — kept exported for backwards compatibility,
//      but no production code should rely on it after PR α.5.
//
//   2. Schema-less section enumeration (`findEmitSections`) — used by the
//      v0.4.1+ derive pipeline. Discovers structural "leaves" in the MD AST
//      regardless of heading numbering, so authors can renumber/rename/remove
//      sections freely without breaking the parser.

var marked = require("marked");

function parseMarkdown(source) {
  return marked.lexer(String(source));
}

// Legacy: match leading numbering like "1.", "2.1", "2.10", etc.
var NUMBERED_HEADING_RE = /^(\d{1,2}(?:\.\d{1,2})*)\.?\s+(.+?)\s*$/;

// Strip any leading section-number prefix (with optional trailing dot).
//   "2.11 Motion" → "Motion"
//   "1. Color"    → "Color"
var NUM_PREFIX_RE = /^\s*\d+(?:\.\d+)*\.?\s+/;

// Strip leading emoji from a heading before slugifying. Covers common Unicode
// emoji ranges; the regex is intentionally broad — anything emoji-like at the
// very start of the heading gets dropped, regardless of vocabulary.
var LEADING_EMOJI_STRIP_RE =
  /^\s*(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?\s*)+/u;

function findNumberedHeadings(tokens) {
  var out = [];
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i];
    if (token.type !== "heading") continue;
    if (token.depth !== 2 && token.depth !== 3) continue;
    var match = NUMBERED_HEADING_RE.exec(String(token.text || ""));
    if (!match) continue;
    out.push({
      number: match[1],
      text: match[2],
      depth: token.depth,
      tokenIndex: i,
    });
  }
  return out;
}

function sliceSectionContent(tokens, heading) {
  var out = [];
  for (var i = heading.tokenIndex + 1; i < tokens.length; i++) {
    var token = tokens[i];
    if (token.type === "heading" && token.depth <= heading.depth) break;
    out.push(token);
  }
  return out;
}

// Strip trailing {#anchor} + section-number + leading emoji + collapse whitespace.
function cleanHeading(text) {
  var s = String(text || "");
  // Strip an explicit {#slug} anchor before any other normalization so the
  // derived slug matches the un-anchored heading (anchors are stable IDs, not
  // part of the visible title). See foundations-refs design 2026-05-29.
  s = s.replace(/\s*\{#[a-z0-9-]+\}\s*$/, "");
  // Strip in either order — author may have put emoji before number or after.
  s = s.replace(LEADING_EMOJI_STRIP_RE, "");
  s = s.replace(NUM_PREFIX_RE, "");
  s = s.replace(LEADING_EMOJI_STRIP_RE, "");
  return s.trim();
}

// Slugify a (cleaned) heading text. Lowercase, kebab-case, ASCII-only.
function slugify(text) {
  var s = String(text || "").toLowerCase();
  // Replace em-dashes / en-dashes with regular dashes for predictable output
  s = s.replace(/[—–]/g, "-");
  // Replace any non-alphanumeric with dash
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s;
}

// Stateful slug deduplicator (mirrors github-slugger's behavior). Repeated
// inputs get a numeric suffix: foo, foo-1, foo-2, ...
function createSlugger() {
  var seen = Object.create(null);
  function slugFn(text) {
    var base = slugify(cleanHeading(text));
    if (!base) base = "section";
    if (!seen[base]) {
      seen[base] = 1;
      return base;
    }
    // Generate next available suffix
    var n = seen[base];
    var candidate;
    do {
      candidate = base + "-" + n;
      n++;
    } while (seen[candidate]);
    seen[base] = n;
    seen[candidate] = 1;
    return candidate;
  }
  return {
    slug: slugFn,
    seen: seen,
    // Reserve a pre-computed slug (used for "-overview" emits that bypass cleanHeading).
    reserve: function (rawSlug) {
      if (!seen[rawSlug]) {
        seen[rawSlug] = 1;
        return rawSlug;
      }
      var n = seen[rawSlug];
      var candidate;
      do {
        candidate = rawSlug + "-" + n;
        n++;
      } while (seen[candidate]);
      seen[rawSlug] = n;
      seen[candidate] = 1;
      return candidate;
    },
  };
}

// Slice tokens that belong to a heading (between this heading and the next
// heading of equal-or-shallower depth).
function sliceHeading(tokens, headingIdx) {
  var heading = tokens[headingIdx];
  if (!heading || heading.type !== "heading") return [];
  var out = [];
  for (var i = headingIdx + 1; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === "heading" && t.depth <= heading.depth) break;
    out.push(t);
  }
  return out;
}

// Find absolute indices of direct child headings (depth = parentDepth + 1)
// within the section rooted at `parentIdx`.
function findChildHeadingsAt(tokens, parentIdx) {
  var parent = tokens[parentIdx];
  if (!parent || parent.type !== "heading") return [];
  var parentDepth = parent.depth;
  var childDepth = parentDepth + 1;
  var out = [];
  for (var i = parentIdx + 1; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type !== "heading") continue;
    if (t.depth <= parentDepth) break;
    if (t.depth === childDepth) out.push(i);
  }
  return out;
}

// Return tokens between heading `idx` and its first sub-heading (or end
// of section). Captures "intro prose" that lives directly under an H2/H3
// before any sub-heading.
function sliceDirectContent(tokens, idx) {
  var heading = tokens[idx];
  if (!heading || heading.type !== "heading") return [];
  var parentDepth = heading.depth;
  var out = [];
  for (var i = idx + 1; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === "heading") {
      if (t.depth <= parentDepth) break;
      break; // any deeper heading also ends the direct-content zone
    }
    out.push(t);
  }
  return out;
}

// Does this slice contain any non-trivial payload (table/list/code/prose)?
function hasMeaningfulContent(tokenSlice) {
  for (var i = 0; i < tokenSlice.length; i++) {
    var t = tokenSlice[i];
    if (t.type === "table" || t.type === "list" || t.type === "code")
      return true;
    if (t.type === "paragraph") {
      var s = String(t.text || "").trim();
      if (s.length > 0) return true;
    }
  }
  return false;
}

// Schema-less section enumeration. Walks H2 headings and decides what to emit:
//
//   - H2 with no H3 children:                       emit one file at H2 level
//   - H2 with H3 children, no direct prose:         emit one file per H3
//   - H2 with H3 children + direct prose:           emit one file per H3 +
//                                                   one "<slug>-overview"
//                                                   file for the H2-level
//                                                   prose
//
// Returns [{ slug, heading, rawHeading, depth, kind, content, startIdx }, ...]
// where `kind` is "h2" | "h3" | "h2-overview".
function findEmitSections(tokens, opts) {
  opts = opts || {};
  var skipH2Slugs = opts.skipH2Slugs || {};
  var slugger = createSlugger();
  var out = [];

  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type !== "heading" || t.depth !== 2) continue;

    var h2Text = cleanHeading(t.text);
    var h2BaseSlug = slugify(h2Text);

    // "Table of Contents" is structural noise — always skip
    if (h2BaseSlug === "table-of-contents") continue;
    if (skipH2Slugs[h2BaseSlug]) continue;

    var h3Indices = findChildHeadingsAt(tokens, i);
    var directContent = sliceDirectContent(tokens, i);

    if (h3Indices.length === 0) {
      // No H3 children — emit at H2 level
      var h2Slug = slugger.slug(t.text);
      out.push({
        slug: h2Slug,
        heading: h2Text,
        rawHeading: t.text,
        depth: 2,
        kind: "h2",
        content: sliceHeading(tokens, i),
        startIdx: i,
      });
      continue;
    }

    // Has H3 children. Emit an "-overview" entry if the H2 has direct content.
    if (hasMeaningfulContent(directContent)) {
      var overviewBase = h2BaseSlug + "-overview";
      var overviewSlug = slugger.reserve(overviewBase);
      out.push({
        slug: overviewSlug,
        heading: h2Text + " (overview)",
        rawHeading: t.text,
        depth: 2,
        kind: "h2-overview",
        content: directContent,
        startIdx: i,
      });
    }

    // Emit one file per H3
    for (var j = 0; j < h3Indices.length; j++) {
      var h3Idx = h3Indices[j];
      var h3Tok = tokens[h3Idx];
      var h3Slug = slugger.slug(h3Tok.text);
      out.push({
        slug: h3Slug,
        heading: cleanHeading(h3Tok.text),
        rawHeading: h3Tok.text,
        depth: 3,
        kind: "h3",
        content: sliceHeading(tokens, h3Idx),
        startIdx: h3Idx,
      });
    }
  }

  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Pattern H — hierarchical section tree
// ───────────────────────────────────────────────────────────────────────────
//
// Walks the AST and builds a recursive tree where:
//
//   - The root is the document (skipped — we only emit children of root).
//   - Each H2 becomes either a leaf (no child headings) or a branch
//     (has H3 children).
//   - Each H3 becomes either a leaf (no H4 children) or a branch.
//   - H4 is always a leaf in current design (no H5 emitted as a directory
//     unless authors introduce them; algorithm handles arbitrary depth).
//
// The tree distinguishes "directContent" (tokens between a heading and its
// first child heading) from "children" so the emitter can render an
// `_index.json` with body+blocks for branch sections.
//
// Source-line tracking: marked v14 exposes `token.raw` which we sum to
// derive 1-indexed line numbers per heading + slice.

// Compute startLine/endLine offsets for every token, in-place. Adds
// `_startLine` and `_endLine` fields (1-indexed, inclusive). Idempotent.
function annotateLines(tokens) {
  var line = 1;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (typeof t._startLine === "number") {
      // Already annotated.
      line = t._endLine + 1;
      continue;
    }
    var raw = typeof t.raw === "string" ? t.raw : "";
    var newlines = 0;
    for (var k = 0; k < raw.length; k++) {
      if (raw.charCodeAt(k) === 10) newlines++;
    }
    t._startLine = line;
    // A heading's raw includes its trailing newline; for accurate endLine
    // we count newlines and don't double-shift.
    var span = newlines === 0 ? 0 : newlines - 1;
    // Special-case: if `raw` ends with newline, the visible content occupies
    // `newlines` lines counting from startLine. If no trailing newline, it's
    // `newlines + 1` lines. We use a conservative approach: endLine spans
    // the token's text — most tokens (heading/paragraph/code) end with a
    // newline, so endLine = startLine + newlines - 1. But a token without
    // trailing newline (last in file) gets endLine = startLine + newlines.
    var endsWithNL = raw.length > 0 && raw.charCodeAt(raw.length - 1) === 10;
    var lines = newlines + (endsWithNL ? 0 : 1);
    if (lines === 0) lines = 1;
    t._endLine = line + lines - 1;
    line = line + lines;
  }
  return tokens;
}

// Recursive section-tree builder. Returns an array of section nodes:
//   {
//     slug:        "tokens",
//     title:       "Tokens",
//     rawHeading:  "2. Tokens",
//     depth:       2,
//     headingIdx:  N,
//     startLine:   42,
//     endLine:     100,
//     directContent: [ tokens between heading and first child heading ],
//     children:    [ /* recursive section nodes */ ],
//     content:     [ all tokens under this heading, recursive ],  // unsliced
//   }
//
// `slugger` is created at root level and threaded through; slug collisions
// within a sibling group are resolved with numeric suffixes. Different
// parent scopes get independent sluggers (so two H3s named "Color" under
// different H2s don't collide).
//
// Skip H2 slugs (out-of-scope sections) are dropped at the H2 level only.
function buildSectionTree(tokens, opts) {
  opts = opts || {};
  var skipH2Slugs = opts.skipH2Slugs || {};

  function buildLevel(parentDepth, fromIdx, toIdx) {
    // Slugger is per-parent (sibling-scoped).
    var slugger = createSlugger();
    var childDepth = parentDepth + 1;
    var out = [];

    // Find sibling heading indices at exactly childDepth within [fromIdx, toIdx).
    var siblingIdxs = [];
    for (var i = fromIdx; i < toIdx; i++) {
      var t = tokens[i];
      if (t.type !== "heading") continue;
      if (t.depth <= parentDepth) continue;
      if (t.depth === childDepth) siblingIdxs.push(i);
    }

    for (var j = 0; j < siblingIdxs.length; j++) {
      var hi = siblingIdxs[j];
      var hTok = tokens[hi];
      var cleaned = cleanHeading(hTok.text);

      // Skip TOC + opt-in skip slugs at H2 level only
      if (parentDepth === 1) {
        var baseSlug = slugify(cleaned);
        if (baseSlug === "table-of-contents") continue;
        if (skipH2Slugs[baseSlug]) continue;
      }

      var nextHi = j + 1 < siblingIdxs.length ? siblingIdxs[j + 1] : toIdx;
      // End of this section = next sibling, or end of parent scope.
      var sectionEnd = nextHi;

      // Find first child-heading-of-deeper-depth within section to split
      // directContent from children content.
      var firstChildHi = sectionEnd;
      for (var k = hi + 1; k < sectionEnd; k++) {
        var ck = tokens[k];
        if (ck.type === "heading" && ck.depth > childDepth) {
          firstChildHi = k;
          break;
        }
        if (ck.type === "heading" && ck.depth <= childDepth) break;
      }

      var directContent = [];
      for (var p = hi + 1; p < firstChildHi; p++) {
        directContent.push(tokens[p]);
      }

      var children = buildLevel(childDepth, hi + 1, sectionEnd);

      var slug = slugger.slug(hTok.text);
      var startLine =
        typeof hTok._startLine === "number" ? hTok._startLine : null;
      // endLine = endLine of the last token in this section (heading-inclusive).
      var lastIdx = sectionEnd - 1;
      var endLine = null;
      if (lastIdx >= hi && typeof tokens[lastIdx]._endLine === "number") {
        endLine = tokens[lastIdx]._endLine;
      }

      out.push({
        slug: slug,
        title: cleaned,
        rawHeading: hTok.text,
        depth: childDepth,
        headingIdx: hi,
        startLine: startLine,
        endLine: endLine,
        directContent: directContent,
        children: children,
      });
    }

    return out;
  }

  annotateLines(tokens);

  // Start from H1 (depth 1) — its children are H2 sections.
  // If no H1, treat depth 1 as virtual root.
  return buildLevel(1, 0, tokens.length);
}

module.exports.parseMarkdown = parseMarkdown;
module.exports.findNumberedHeadings = findNumberedHeadings;
module.exports.sliceSectionContent = sliceSectionContent;
module.exports.findEmitSections = findEmitSections;
module.exports.cleanHeading = cleanHeading;
module.exports.slugify = slugify;
module.exports.createSlugger = createSlugger;
module.exports.findChildHeadingsAt = findChildHeadingsAt;
module.exports.sliceDirectContent = sliceDirectContent;
module.exports.hasMeaningfulContent = hasMeaningfulContent;
module.exports.sliceHeading = sliceHeading;
module.exports.annotateLines = annotateLines;
module.exports.buildSectionTree = buildSectionTree;
