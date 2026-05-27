"use strict";

// Hierarchical foundations derive (PR α.5 v2, v0.4.1+).
//
// Walks the AST of the concatenated foundations/src/ per-section files and
// emits a *folder
// hierarchy* mirroring the MD structure. Per Pattern H (Hybrid):
//
//   - Each leaf section (no child headings) → `<slug>.json`
//   - Each branch section (has child headings) → `<slug>/` directory with
//     `_index.json` carrying section metadata + body/blocks + child list.
//   - Root `_index.json` carries top-level metadata.
//   - `foundations.bundle.json` is a single nested roll-up (full tree) for
//     one-shot LLM consumption.
//   - `foundations.md` is copied verbatim from src/ for Stripe-style
//     `.md` URL access.
//
// Authors (UX team) can renumber/rename/remove/restructure sections freely
// — the parser tracks MD structure, not section numbers.
//
// Special case: the Motion section (detected by content shape — H4 children
// named Duration/Easing/Delay) emits a SINGLE leaf JSON with the structured
// `{tokens, patterns}` shape, even though its H4 children would normally
// imply a sub-directory. This preserves the plugin's motion-pattern lookup
// API. PR ε migrates plugin paths to the new hierarchical location.
//
// `paths-manifest.json` foundations.* entries are auto-regenerated based on
// the actual dist files produced. The manifest's foundations.bundle entry
// plus foundations.{tokens,foundations,component-specs,etc.}._index point
// to the per-directory metadata files; per-leaf paths are mostly accessed
// via the bundle.

var fs = require("fs");
var path = require("path");
var astWalk = require("./foundations-parser/ast-walk.js");
var extractors = require("./foundations-parser/extractors.js");
var statusEmoji = require("./foundations-parser/status-emoji.js");
var { writeManifest } = require("../lib/manifest-io");

// ───────────────────────────────────────────────────────────────────────────
// Status emoji application — common helper for token tables
// ───────────────────────────────────────────────────────────────────────────

function applyStatusToRows(rows, sectionLabel, logger) {
  return rows.map(function (row) {
    var copy = {};
    var status = null;
    var keys = Object.keys(row);
    var statusColRaw = null;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = row[k];
      if (k.toLowerCase() === "status") {
        statusColRaw = v;
        var parsed = statusEmoji.extractStatus.fromValueCell(v);
        status = parsed.status;
        var emojiRecognized =
          statusEmoji.extractStatus(String(v).trim()) !== null ||
          Object.prototype.hasOwnProperty.call(
            statusEmoji.extractStatus.STATUS_MAP,
            String(v).trim(),
          );
        if (parsed.value && parsed.value.length > 0) {
          copy.status_note = parsed.value;
        }
        if (!emojiRecognized) {
          statusColRaw = v;
        } else {
          statusColRaw = null;
        }
        continue;
      }
      copy[k] = v;
    }
    if (status) copy.status = status;
    if (statusColRaw && status === null && !copy.status_note && logger) {
      logger.warn(
        "Section '" +
          sectionLabel +
          "': unrecognized status cell '" +
          statusColRaw +
          "'. " +
          statusEmoji.extractStatus.suggestionHint(),
      );
    }
    return copy;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Motion payload (special-cased structured emit)
// ───────────────────────────────────────────────────────────────────────────

var PATTERN_ANCHOR_RE = /^\s*\{#([a-z0-9-]+)\}\s*$/;
// Trailing-anchor form for stripping the marker from concatenated prose
// (e.g. extractProse() returns "Pattern Name {#slug}" — strip the tail).
var PATTERN_ANCHOR_STRIP_RE = /\s*\{#[a-z0-9-]+\}\s*$/;

// A pattern-bold paragraph is either:
//   **Pattern Name**                                      (legacy)
//   **Pattern Name** {#canonical-slug}                    (D2: explicit slug)
// Permitting an optional trailing `{#slug}` text token is how authors declare
// the canonical pattern slug in source instead of relying on a script-side
// map (Substrate Doctrine P6; R6 pre-build D2).
function isBoldOnlyParagraph(token) {
  if (!token || token.type !== "paragraph" || !Array.isArray(token.tokens))
    return false;
  var significant = token.tokens.filter(function (t) {
    if (t.type === "text") return String(t.text || "").trim().length > 0;
    return true;
  });
  if (significant.length === 1) {
    return significant[0].type === "strong";
  }
  if (significant.length === 2) {
    return (
      significant[0].type === "strong" &&
      significant[1].type === "text" &&
      PATTERN_ANCHOR_RE.test(String(significant[1].text || ""))
    );
  }
  return false;
}

// Extract the explicit `{#anchor}` slug from a pattern-bold paragraph, or
// null if absent. Author-declared anchor is authoritative; consumers depend
// on this slug in `foundations/dist/tokens/motion.json#patterns[*].slug`.
function extractExplicitPatternAnchor(token) {
  if (!token || !Array.isArray(token.tokens)) return null;
  for (var i = 0; i < token.tokens.length; i++) {
    var t = token.tokens[i];
    if (t.type !== "text") continue;
    var m = String(t.text || "").match(PATTERN_ANCHOR_RE);
    if (m) return m[1];
  }
  return null;
}

function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function slugifyPatternName(name) {
  var s = decodeHtmlEntities(name)
    .replace(/^The\s+/i, "")
    .replace(/["“”]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/—.*$/, "")
    .trim()
    .toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return s;
}

// D2 (R6 pre-build): the legacy `CANONICAL_PATTERN_SLUGS` name→slug map has
// been retired. Canonical pattern slugs are now author-declared in source
// via `**Pattern Name** {#canonical-slug}` (see PATTERN_ANCHOR_RE above).
// When a pattern paragraph has no explicit anchor, the short slug from
// `slugifyPatternName` is used directly — there is no longer a separate
// "canonical" slug derivation outside the source.

function canonicalSlugForPattern(name) {
  var decoded = decodeHtmlEntities(name)
    .replace(/^The\s+/i, "")
    .replace(/["“”]/g, "")
    .trim()
    .toLowerCase();
  return decoded.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isPatternSubsectionLabel(decodedName) {
  return /^\s*logic\s*&\s*accessibility\s*$/i.test(decodedName);
}

// Detect whether a section node looks like the Motion section.
// Motion is recognized by its H4 children: Duration + Easing + Delay must
// all be present. (Component Motion Guide is optional.) This is content-
// shape detection — the section can be named anything and live anywhere.
function isMotionShape(sectionNode) {
  if (!sectionNode || !Array.isArray(sectionNode.children)) return false;
  var seen = { duration: false, easing: false, delay: false };
  for (var i = 0; i < sectionNode.children.length; i++) {
    var slug = sectionNode.children[i].slug;
    if (slug === "duration") seen.duration = true;
    else if (slug === "easing") seen.easing = true;
    else if (slug === "delay") seen.delay = true;
  }
  return seen.duration && seen.easing && seen.delay;
}

// Flatten a section node + its descendants into a single content-token list
// (used to drive the motion payload builder which walks H4 boundaries
// itself).
function flattenSectionContent(sectionNode) {
  var out = [];
  // Direct content first
  for (var i = 0; i < sectionNode.directContent.length; i++) {
    out.push(sectionNode.directContent[i]);
  }
  // Then each child: heading + child content (recursive)
  for (var j = 0; j < sectionNode.children.length; j++) {
    var child = sectionNode.children[j];
    // Synthesize a heading token for the child (so the motion walker can
    // detect h4 transitions).
    out.push({
      type: "heading",
      depth: child.depth,
      text: child.title,
      raw: "#".repeat(child.depth) + " " + child.title,
    });
    var sub = flattenSectionContent(child);
    for (var k = 0; k < sub.length; k++) out.push(sub[k]);
  }
  return out;
}

function buildMotionPayload(contentTokens, sectionLabel, logger) {
  var payload = { description: null, tokens: {}, patterns: {} };
  var introLines = [];
  var mode = "intro";
  var currentPatternSlug = null;

  function ensureTokenBucket(key) {
    if (!payload.tokens[key]) payload.tokens[key] = {};
    return payload.tokens[key];
  }

  for (var i = 0; i < contentTokens.length; i++) {
    var tok = contentTokens[i];

    if (tok.type === "heading" && tok.depth === 4) {
      var h = String(tok.text || "")
        .toLowerCase()
        .trim();
      if (h === "duration") mode = "duration";
      else if (h === "easing") mode = "easing";
      else if (h === "delay") mode = "delay";
      else if (h === "component motion guide") {
        mode = "guide";
        currentPatternSlug = null;
      } else {
        currentPatternSlug = null;
      }
      continue;
    }

    if (mode === "intro" && tok.type === "paragraph") {
      var prose = extractors.extractProse(tok);
      if (prose) introLines.push(prose);
      continue;
    }

    if (mode === "duration" || mode === "easing" || mode === "delay") {
      var bucket = ensureTokenBucket(mode);
      if (tok.type === "table") {
        var rows = extractors.extractTable(tok);
        bucket.rows = applyStatusToRows(rows, sectionLabel, logger);
      } else if (tok.type === "paragraph") {
        var p = extractors.extractProse(tok);
        if (p)
          bucket.description = bucket.description
            ? bucket.description + "\n\n" + p
            : p;
      }
      continue;
    }

    if (mode === "guide") {
      if (tok.type === "paragraph") {
        if (isBoldOnlyParagraph(tok)) {
          var explicitAnchor = extractExplicitPatternAnchor(tok);
          var rawName = extractors
            .extractProse(tok)
            .replace(PATTERN_ANCHOR_STRIP_RE, "")
            .trim();
          var name = decodeHtmlEntities(rawName);
          if (isPatternSubsectionLabel(name) && currentPatternSlug) {
            payload.patterns[currentPatternSlug]._pendingSubsection =
              "logic_and_accessibility";
            continue;
          }
          var slug = slugifyPatternName(rawName);
          if (!slug) {
            logger.warn(
              "Section '" +
                sectionLabel +
                "' pattern paragraph '" +
                name +
                "' produced empty slug; skipping",
            );
            currentPatternSlug = null;
            continue;
          }
          if (payload.patterns[slug]) {
            logger.warn(
              "Section '" +
                sectionLabel +
                "' duplicate pattern slug '" +
                slug +
                "' — keeping first",
            );
            currentPatternSlug = null;
            continue;
          }
          payload.patterns[slug] = {
            slug: explicitAnchor || canonicalSlugForPattern(name),
            name: name,
            phases: [],
          };
          currentPatternSlug = slug;
          continue;
        }
        var notesText = decodeHtmlEntities(extractors.extractProse(tok));
        if (notesText && currentPatternSlug) {
          var pat = payload.patterns[currentPatternSlug];
          if (!pat.notes) pat.notes = [];
          pat.notes.push(notesText);
        }
        continue;
      }
      if (tok.type === "table" && currentPatternSlug) {
        payload.patterns[currentPatternSlug].phases =
          extractors.extractTable(tok);
        continue;
      }
      if (tok.type === "list" && currentPatternSlug) {
        var listItems = extractors.extractList(tok).map(decodeHtmlEntities);
        var pendingKey =
          payload.patterns[currentPatternSlug]._pendingSubsection ||
          "logic_and_accessibility";
        payload.patterns[currentPatternSlug][pendingKey] = listItems;
        delete payload.patterns[currentPatternSlug]._pendingSubsection;
        continue;
      }
    }
  }

  if (introLines.length) payload.description = introLines.join("\n\n");
  if (!payload.description) delete payload.description;
  if (Object.keys(payload.tokens).length === 0) delete payload.tokens;
  if (Object.keys(payload.patterns).length === 0) delete payload.patterns;

  Object.keys(payload.patterns || {}).forEach(function (slug) {
    if (payload.patterns[slug] && payload.patterns[slug]._pendingSubsection) {
      delete payload.patterns[slug]._pendingSubsection;
    }
  });
  return payload;
}

// ───────────────────────────────────────────────────────────────────────────
// Generic block extraction — turns AST tokens into structured `blocks[]`
// ───────────────────────────────────────────────────────────────────────────

function looksLikeMalformedTable(prose) {
  var lines = String(prose)
    .split(/\n/)
    .filter(function (l) {
      return l.trim().length > 0;
    });
  if (lines.length < 2) return false;
  var pipeyLines = 0;
  var hasSeparator = false;
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i].trim();
    if (/^\|.*\|/.test(ln) && (ln.match(/\|/g) || []).length >= 2) {
      pipeyLines++;
      if (/^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?\s*$/.test(ln)) {
        hasSeparator = true;
      }
    }
  }
  return pipeyLines >= 2 && !hasSeparator;
}

// Convert a list of AST tokens (no headings — those are section boundaries
// handled by the tree builder) into:
//   { body: "joined prose", blocks: [structured non-prose blocks] }
//
// A "block" is a table / list / code fence, captured with full structure
// so consumers can re-render or query without re-parsing MD.
function extractBodyAndBlocks(contentTokens, sectionLabel, logger) {
  var bodyLines = [];
  var blocks = [];
  for (var i = 0; i < contentTokens.length; i++) {
    var tok = contentTokens[i];
    if (tok.type === "heading") {
      // Should not happen — directContent stops at first child heading. But
      // if it does (sub-H5 within a leaf, say), include it as a body marker.
      bodyLines.push(
        "#".repeat(tok.depth) + " " + String(tok.text || "").trim(),
      );
      continue;
    }
    if (tok.type === "paragraph") {
      var prose = extractors.extractProse(tok);
      if (!prose) continue;
      if (looksLikeMalformedTable(prose) && logger) {
        logger.warn(
          "Section '" +
            sectionLabel +
            "' contains a block that looks like a table but is missing the `|---|` header separator row. " +
            "I parsed it as plain text instead of a table. Add a separator row right under the column headers — for example: `| --- | --- |`.",
        );
      }
      bodyLines.push(prose);
      continue;
    }
    if (tok.type === "table") {
      var rows = extractors.extractTable(tok);
      if (rows.length === 0) continue;
      var headers = [];
      if (tok.header && tok.header.length) {
        headers = tok.header.map(function (h) {
          return extractors.cellText(h);
        });
      } else if (rows.length > 0) {
        headers = Object.keys(rows[0]);
      }
      blocks.push({
        type: "table",
        headers: headers,
        rows: applyStatusToRows(rows, sectionLabel, logger),
      });
      continue;
    }
    if (tok.type === "list") {
      blocks.push({
        type: "list",
        ordered: !!tok.ordered,
        items: extractors.extractList(tok),
      });
      continue;
    }
    if (tok.type === "code") {
      var fb = extractors.extractFencedBlock(tok);
      if (fb)
        blocks.push({
          type: "code",
          language: fb.lang || null,
          content: fb.value || "",
        });
      continue;
    }
    if (tok.type === "blockquote") {
      // Capture blockquote inner text as a single body line prefixed with "> ".
      var inner = "";
      if (Array.isArray(tok.tokens)) {
        for (var j = 0; j < tok.tokens.length; j++) {
          var sub = tok.tokens[j];
          if (sub.type === "paragraph") {
            var ip = extractors.extractProse(sub);
            if (ip) inner += (inner ? "\n" : "") + "> " + ip;
          }
        }
      }
      if (inner) bodyLines.push(inner);
      continue;
    }
    // Ignore: space, hr, html, def
  }
  return {
    body: bodyLines.length ? bodyLines.join("\n\n") : null,
    blocks: blocks,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Hierarchical emission
// ───────────────────────────────────────────────────────────────────────────

// Sections whose H2 slug should be skipped entirely (out-of-scope content).
var SKIP_H2_SLUGS = {
  "handoff-protocol": true,
  "related-guidelines": true,
};

var SCHEMA_VERSION = 1;

function metaBlockDoNotEditText() {
  return "Edit the per-section src/ files; CI regenerates this file.";
}

function metaBlock(sourceRel) {
  return {
    auto_generated: true,
    source: sourceRel || "foundations/src/",
    do_not_edit: metaBlockDoNotEditText(),
  };
}

// Build a fully-rendered per-leaf JSON object.
function buildLeafJson(node, pathSegments, parentId, sourceRel, logger) {
  // Motion exception: structured payload at H3 level.
  if (isMotionShape(node)) {
    var motionTokens = flattenSectionContent(node);
    var motionPayload = buildMotionPayload(motionTokens, node.title, logger);
    var motionLeaf = {
      _schema_version: SCHEMA_VERSION,
      id: pathSegments.join("/"),
      title: node.title,
      path: pathSegments,
      parent: parentId,
      kind: "motion",
      anchors: anchorsFromPath(pathSegments),
      source: {
        file: sourceRel,
        startLine: node.startLine,
        endLine: node.endLine,
      },
      _meta: metaBlock(sourceRel),
    };
    // Merge payload (description / tokens / patterns) at top level
    if (motionPayload.description)
      motionLeaf.description = motionPayload.description;
    if (motionPayload.tokens) motionLeaf.tokens = motionPayload.tokens;
    if (motionPayload.patterns) motionLeaf.patterns = motionPayload.patterns;
    return motionLeaf;
  }

  // Generic leaf: body + blocks from directContent only (children, if any,
  // belong under the directory sibling).
  var bb = extractBodyAndBlocks(node.directContent, node.title, logger);
  var leaf = {
    _schema_version: SCHEMA_VERSION,
    id: pathSegments.join("/"),
    title: node.title,
    path: pathSegments,
    parent: parentId,
    anchors: anchorsFromPath(pathSegments),
    source: {
      file: sourceRel,
      startLine: node.startLine,
      endLine: node.endLine,
    },
    _meta: metaBlock(sourceRel),
  };
  if (bb.body) leaf.body = bb.body;
  if (bb.blocks.length) leaf.blocks = bb.blocks;
  return leaf;
}

function buildIndexJson(node, pathSegments, parentId, sourceRel, logger) {
  var bb = extractBodyAndBlocks(node.directContent, node.title, logger);
  var children = node.children.map(function (c, i) {
    return {
      id: pathSegments.concat([c.slug]).join("/"),
      title: c.title,
      order: i + 1,
    };
  });
  var idx = {
    _schema_version: SCHEMA_VERSION,
    id: pathSegments.join("/"),
    title: node.title,
    path: pathSegments,
    parent: parentId,
    anchors: anchorsFromPath(pathSegments),
    source: {
      file: sourceRel,
      startLine: node.startLine,
      endLine: node.endLine,
    },
    children: children,
    _meta: metaBlock(sourceRel),
  };
  if (bb.body) idx.body = bb.body;
  if (bb.blocks.length) idx.blocks = bb.blocks;
  return idx;
}

function anchorsFromPath(pathSegments) {
  // Anchors keyed by depth level. The h1 anchor is the doc's H1 slug; we
  // capture it from a known constant — the doc-root id is set by the emitter.
  // For schema simplicity we just return a path-segment-keyed map: each
  // segment becomes its own anchor at depth N.
  var out = {};
  for (var i = 0; i < pathSegments.length; i++) {
    out["h" + (i + 2)] = pathSegments[i]; // H2 is segment 0 → "h2"
  }
  return out;
}

// Recursive tree → filesystem map. Returns:
//   { files: { "<rel>": <json> }, leafs: [<leafMeta>...], indexes: [<idxMeta>...], bundleTree: <nested object> }
//
// `files` is a flat map keyed by repo-root-relative path.
function buildEmissionPlan(rootNodes, sourceRel, logger) {
  var files = {};
  var leafs = [];
  var indexes = [];
  var bundleTree = {};

  function visit(node, pathSegments, parentId, bundleParent) {
    var isBranch = node.children.length > 0 && !isMotionShape(node);
    var id = pathSegments.join("/");

    if (!isBranch) {
      // Emit a leaf file at pathSegments[0..-2] / `<slug>.json`.
      var leafFilePath = pathSegments
        .slice(0, -1)
        .concat([pathSegments[pathSegments.length - 1] + ".json"])
        .join("/");
      var leafJson = buildLeafJson(
        node,
        pathSegments,
        parentId,
        sourceRel,
        logger,
      );
      files[leafFilePath] = leafJson;
      leafs.push({ id: id, file: leafFilePath, title: node.title });
      // Bundle: nest under bundleParent at slug key.
      bundleParent[node.slug] = leafJson;
      return;
    }

    // Branch — write _index.json under pathSegments/_index.json and recurse.
    var indexPath = pathSegments.concat(["_index.json"]).join("/");
    var idxJson = buildIndexJson(
      node,
      pathSegments,
      parentId,
      sourceRel,
      logger,
    );
    files[indexPath] = idxJson;
    indexes.push({ id: id, file: indexPath, title: node.title });

    var bundleNode = { _index: idxJson };
    bundleParent[node.slug] = bundleNode;

    for (var i = 0; i < node.children.length; i++) {
      visit(
        node.children[i],
        pathSegments.concat([node.children[i].slug]),
        id,
        bundleNode,
      );
    }
  }

  // H2 nodes have the document root as parent. Use "" as the root id so
  // _index.json (with id "") + per-H2 _index/leaf JSONs link correctly.
  for (var i = 0; i < rootNodes.length; i++) {
    visit(rootNodes[i], [rootNodes[i].slug], "", bundleTree);
  }

  return {
    files: files,
    leafs: leafs,
    indexes: indexes,
    bundleTree: bundleTree,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Root _index.json — top-level foundations metadata
// ───────────────────────────────────────────────────────────────────────────

function buildRootIndex(rootNodes, sourceRel, h1Title) {
  var children = rootNodes.map(function (n, i) {
    return { id: n.slug, title: n.title, order: i + 1 };
  });
  return {
    _schema_version: SCHEMA_VERSION,
    id: "",
    title: h1Title || "Foundations",
    path: [],
    parent: null,
    children: children,
    anchors: { h1: "foundations" },
    source: { file: sourceRel },
    _meta: metaBlock(sourceRel),
  };
}

// Bundle roll-up: same as buildEmissionPlan.bundleTree but wrapped with
// _schema_version + _meta + a root entry.
function buildBundle(bundleTree, rootIndex, sourceRel) {
  var bundle = {
    _schema_version: SCHEMA_VERSION,
    _meta: metaBlock(sourceRel),
    _index: rootIndex,
  };
  Object.keys(bundleTree).forEach(function (k) {
    bundle[k] = bundleTree[k];
  });
  return bundle;
}

// ───────────────────────────────────────────────────────────────────────────
// Top-level derive
// ───────────────────────────────────────────────────────────────────────────

function deriveFromMarkdown(mdSource, opts) {
  opts = opts || {};
  var logger = opts.logger || { warn: function () {} };
  var sourceRel = opts.sourceRel || "foundations/src/";
  var skipMap = opts.skipH2Slugs || SKIP_H2_SLUGS;

  var tokens = astWalk.parseMarkdown(mdSource);
  var tree = astWalk.buildSectionTree(tokens, { skipH2Slugs: skipMap });

  // Find H1 title for root metadata.
  var h1Title = "Foundations";
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "heading" && tokens[i].depth === 1) {
      h1Title = String(tokens[i].text || "").trim();
      break;
    }
  }

  var plan = buildEmissionPlan(tree, sourceRel, logger);
  var rootIndex = buildRootIndex(tree, sourceRel, h1Title);
  var bundle = buildBundle(plan.bundleTree, rootIndex, sourceRel);

  return {
    files: plan.files,
    leafs: plan.leafs,
    indexes: plan.indexes,
    rootIndex: rootIndex,
    bundle: bundle,
    tree: tree,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Filesystem write + prune
// ───────────────────────────────────────────────────────────────────────────

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

function writeAtomic(absPath, contents) {
  var dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, contents);
}

// Recursively walk a directory and return relative paths of all files
// that match `predicate(relPath)`. relPaths use forward slashes.
function walkDir(dir, baseDir, predicate, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var ent = entries[i];
    var full = path.join(dir, ent.name);
    var rel = path.relative(baseDir, full).split(path.sep).join("/");
    if (ent.isDirectory()) {
      walkDir(full, baseDir, predicate, acc);
    } else if (ent.isFile()) {
      if (!predicate || predicate(rel)) acc.push(rel);
    }
  }
  return acc;
}

// Delete a file then recursively prune empty parent directories up to
// (but not including) `stopDir`.
function deleteAndPruneEmpty(absPath, stopDir) {
  fs.unlinkSync(absPath);
  var parent = path.dirname(absPath);
  while (
    parent &&
    parent !== stopDir &&
    parent.startsWith(stopDir + path.sep)
  ) {
    try {
      var entries = fs.readdirSync(parent);
      if (entries.length > 0) break;
      fs.rmdirSync(parent);
    } catch (_e) {
      break;
    }
    parent = path.dirname(parent);
  }
}

function writeOutputs(
  distDir,
  files,
  bundle,
  rootIndex,
  mdContent,
  sourceRel,
  opts,
) {
  opts = opts || {};
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  var written = [];

  // 1. Write per-leaf + per-_index files
  Object.keys(files).forEach(function (relPath) {
    var dest = path.join(distDir, relPath);
    writeAtomic(dest, stableStringify(files[relPath]));
    written.push(relPath);
  });

  // 2. Write root _index.json + bundle + .md copy
  writeAtomic(path.join(distDir, "_index.json"), stableStringify(rootIndex));
  written.push("_index.json");
  writeAtomic(
    path.join(distDir, "foundations.bundle.json"),
    stableStringify(bundle),
  );
  written.push("foundations.bundle.json");

  // Stripe .md URL pattern — emit a verbatim prose copy at dist. The content
  // is the concatenated per-section MD already passed in (matches what the
  // deriver saw). Per-section authoring is the SoT under foundations/src/.
  if (typeof mdContent === "string" && mdContent.length > 0) {
    writeAtomic(path.join(distDir, "foundations.md"), mdContent);
    written.push("foundations.md");
  }

  // 3. Prune stale auto-generated JSON files (idempotency).
  // Owned files: _meta.auto_generated === true. Don't touch foundations.md
  // (it's a verbatim copy — always regenerated). Don't touch README.md or
  // anything else hand-maintained.
  var removed = [];
  if (!opts.skipPrune) {
    var owned = {};
    Object.keys(files).forEach(function (rp) {
      owned[rp] = true;
    });
    owned["_index.json"] = true;
    owned["foundations.bundle.json"] = true;
    var existing = walkDir(distDir, distDir, function (rp) {
      return /\.json$/.test(rp);
    });
    for (var i = 0; i < existing.length; i++) {
      var rp = existing[i];
      if (owned[rp]) continue;
      var fullPath = path.join(distDir, rp);
      try {
        var contents = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        if (
          contents &&
          contents._meta &&
          contents._meta.auto_generated === true
        ) {
          deleteAndPruneEmpty(fullPath, distDir);
          removed.push(rp);
        }
      } catch (_e) {
        // Malformed — leave for a human.
      }
    }
  }

  return { written: written, removed: removed };
}

// ───────────────────────────────────────────────────────────────────────────
// paths-manifest.json auto-generation (foundations.* entries)
// ───────────────────────────────────────────────────────────────────────────
//
// Hierarchical Pattern H emits a LOT of files. We don't want to enumerate
// every leaf JSON in the manifest (would balloon the manifest). Instead:
//
//   - One top-level `foundations.bundle` entry → foundations/dist/foundations.bundle.json
//   - One `foundations.md` (verbatim copy) entry → foundations/dist/foundations.md
//   - One `foundations.<topLevelSlug>` per H2 directory → its `_index.json`
//     or, for leaf-H2, its `.json` file.
//   - Plus the auto-generated marker note.
//
// Per-leaf paths can still be located via the bundle (one fetch gives the
// full tree). The plugin's PR ε will update its lookup paths.

var MANIFEST_FOUNDATIONS_NOTE =
  "foundations.* entries are auto-regenerated by scripts/foundations/derive-foundations.js. Do not hand-edit. Hierarchical layout: bundle for one-shot, per-H2 _index entries for navigation; full per-leaf tree lives under foundations/dist/<slug>/.";

function updatePathsManifest(manifestPath, derived, sourceRel, opts) {
  opts = opts || {};
  var manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  if (!manifest.paths) manifest.paths = {};

  // 1. Drop existing auto-generated foundations.* entries (preserve human-
  //    maintained pointers).
  //
  // foundations.md (legacy single-file pointer) was retired when the SoT
  // moved to per-section files under foundations/src/. The new authoring
  // surface lives in collections (foundations.guide), not paths.
  var preservedKeys = {
    "foundations.authoring": true,
  };
  var dropped = [];
  Object.keys(manifest.paths).forEach(function (k) {
    if (k.indexOf("foundations.") !== 0) return;
    if (preservedKeys[k]) return;
    dropped.push(k);
    delete manifest.paths[k];
  });

  var added = [];

  // 2. foundations.bundle — single roll-up
  manifest.paths["foundations.bundle"] = {
    path: "foundations/dist/foundations.bundle.json",
    type: "json",
    origin: "ci",
    generator: "scripts/foundations/derive-foundations.js",
    description:
      "Full nested foundations tree (hierarchical Pattern H roll-up). One-shot LLM consumption: every section/leaf reachable from this single file.",
  };
  added.push("foundations.bundle");

  // 3. foundations.index — root _index.json
  manifest.paths["foundations.index"] = {
    path: "foundations/dist/_index.json",
    type: "json",
    origin: "ci",
    generator: "scripts/foundations/derive-foundations.js",
    description:
      "Root foundations metadata + top-level child list. Navigate from here to per-H2 directories.",
  };
  added.push("foundations.index");

  // 4. foundations.source — verbatim MD copy at dist for Stripe .md URL pattern.
  manifest.paths["foundations.source"] = {
    path: "foundations/dist/foundations.md",
    type: "markdown",
    origin: "ci",
    generator: "scripts/foundations/derive-foundations.js",
    description:
      "Verbatim copy of the concatenated foundations/src/ per-section files (Stripe .md URL pattern). Auto-synced; do not edit.",
  };
  added.push("foundations.source");

  // 5. Per top-level (H2) section: point at its _index.json (branch) or
  //    leaf .json file. Key is `foundations.<topSlug>`.
  var topLevels = derived.tree.map(function (n) {
    return n;
  });
  // A motion-shape child (Duration/Easing/Delay — see isMotionShape) is
  // emitted as its own structured leaf and is consumed DIRECTLY by motion-ref
  // resolution in the plugin + docs category-defaults-loader
  // (manifest.paths["foundations.<slug>.motion"]). When a section has one,
  // surface it explicitly: the section's own key becomes
  // `foundations.<slug>.index` so `.motion` can sit beside it without breaking
  // the leaf-XOR-namespace rule (tests/manifest-convention).
  for (var i = 0; i < topLevels.length; i++) {
    var n = topLevels[i];
    var hasChildren = n.children.length > 0 && !isMotionShape(n);
    var motionChild = null;
    for (var c = 0; c < n.children.length; c++) {
      if (isMotionShape(n.children[c])) {
        motionChild = n.children[c];
        break;
      }
    }
    var p = hasChildren
      ? "foundations/dist/" + n.slug + "/_index.json"
      : "foundations/dist/" + n.slug + ".json";
    var description = hasChildren
      ? "Hierarchical _index for foundations section '" +
        n.title +
        "'. Children listed inside; sibling files under foundations/dist/" +
        n.slug +
        "/."
      : "Foundations section '" + n.title + "' (leaf-only — no sub-sections).";
    var key = motionChild
      ? "foundations." + n.slug + ".index"
      : "foundations." + n.slug;
    manifest.paths[key] = {
      path: p,
      type: "json",
      origin: "ci",
      generator: "scripts/foundations/derive-foundations.js",
      description: description,
    };
    added.push(key);
    if (motionChild) {
      var motionKey = "foundations." + n.slug + "." + motionChild.slug;
      manifest.paths[motionKey] = {
        path: "foundations/dist/" + n.slug + "/" + motionChild.slug + ".json",
        type: "json",
        origin: "ci",
        generator: "scripts/foundations/derive-foundations.js",
        description:
          "Structured motion leaf (tokens + patterns) for foundations " +
          "section '" +
          n.title +
          "'. Resolved directly by motion-ref lookup in the plugin + docs.",
      };
      added.push(motionKey);
    }
  }

  // 6. Marker note.
  manifest._notes = manifest._notes || {};
  manifest._notes.foundations_auto = MANIFEST_FOUNDATIONS_NOTE;

  // 7. Collection entry for the per-leaf tree (so consumers know the layout).
  if (!manifest.collections) manifest.collections = {};
  manifest.collections["foundations.leaf"] = {
    dir: "foundations/dist",
    pattern: "<topSlug>/.../<slug>.json",
    recursive: true,
    type: "json",
    origin: "ci",
    description:
      "Per-leaf foundations JSONs in hierarchical Pattern H layout. Each leaf mirrors its MD heading path. Branch nodes carry an `_index.json` instead. Single roll-up at foundations.bundle. Recursive: any file under foundations/dist/ is covered by this collection.",
  };

  if (!opts.dryRun) {
    writeManifest(manifestPath, manifest);
  }
  return { added: added, dropped: dropped, manifest: manifest };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI
// ───────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  var args = {};
  for (var i = 2; i < argv.length; i++) {
    var a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--md") args.md = argv[++i];
    else if (a === "--src-dir") args.srcDir = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--manifest") args.manifest = argv[++i];
    else if (a === "--no-manifest") args.noManifest = true;
    else if (a === "--no-prune") args.noPrune = true;
    else if (a === "--map") {
      args._legacyMap = argv[++i];
    }
  }
  return args;
}

function defaultPaths() {
  var repoRoot = path.resolve(__dirname, "..", "..");
  return {
    srcDir: path.join(repoRoot, "foundations", "src"),
    out: path.join(repoRoot, "foundations", "dist"),
    manifest: path.join(repoRoot, "paths-manifest.json"),
    repoRoot: repoRoot,
  };
}

// Read all per-section MD files under srcDir (sorted alphabetically, AUTHORING.md
// excluded), trim trailing whitespace from each, and concatenate with
// `\n\n---\n\n` separators between consecutive files. The result is the input
// fed to the MD parser AND emitted verbatim to dist/foundations.md for the
// Stripe .md URL pattern. Sort order = canonical section order (numeric
// `NN-` prefix encodes the H2 sequence).
function concatFoundationsSources(srcDir) {
  var entries = fs
    .readdirSync(srcDir)
    .filter(function (n) {
      return n.endsWith(".md") && n !== "AUTHORING.md";
    })
    .sort();
  if (entries.length === 0) {
    throw new Error(
      "no .md files found under " + srcDir + " (excluding AUTHORING.md)",
    );
  }
  return entries
    .map(function (name) {
      return fs
        .readFileSync(path.join(srcDir, name), "utf-8")
        .replace(/\s+$/, "");
    })
    .join("\n\n---\n\n");
}

function runCli(argv) {
  var args = parseArgs(argv);
  var defaults = defaultPaths();
  var srcDir = args.srcDir || defaults.srcDir;
  var outDir = args.out || defaults.out;
  var manifestPath = args.manifest || defaults.manifest;

  if (args._legacyMap) {
    console.warn(
      "[derive-foundations] --map is deprecated (hierarchical derive uses MD structure directly); ignoring '" +
        args._legacyMap +
        "'.",
    );
  }
  if (args.md) {
    console.warn(
      "[derive-foundations] --md is deprecated (per-section split moved authoring to a directory of files); ignoring '" +
        args.md +
        "'. Use --src-dir instead.",
    );
  }

  if (!fs.existsSync(srcDir)) {
    console.error(
      "[derive-foundations] source directory not found: " +
        srcDir +
        "\nCheck the path — is it really foundations/src/?",
    );
    return 2;
  }

  var md;
  try {
    md = concatFoundationsSources(srcDir);
  } catch (err) {
    console.error("[derive-foundations] " + err.message);
    return 2;
  }
  var logger = {
    warn: function (m) {
      console.warn("[derive-foundations] " + m);
    },
  };

  var sourceRel =
    path
      .relative(defaults.repoRoot, srcDir)
      .replace(/\\/g, "/")
      .replace(/\/$/, "") + "/";

  var derived;
  try {
    derived = deriveFromMarkdown(md, { logger: logger, sourceRel: sourceRel });
  } catch (err) {
    console.error("[derive-foundations] failed to parse MD: " + err.message);
    console.error(
      "  Hint: check for malformed tables (missing column header, missing pipe), unclosed code fences, or H2/H3 nesting issues near the line in question.",
    );
    return 3;
  }

  if (args.check) {
    var drifts = [];
    Object.keys(derived.files).forEach(function (rp) {
      var expected = stableStringify(derived.files[rp]);
      var dest = path.join(outDir, rp);
      var actual = fs.existsSync(dest) ? fs.readFileSync(dest, "utf-8") : "";
      if (actual !== expected) drifts.push(rp);
    });
    var rootExpected = stableStringify(derived.rootIndex);
    var rootDest = path.join(outDir, "_index.json");
    var rootActual = fs.existsSync(rootDest)
      ? fs.readFileSync(rootDest, "utf-8")
      : "";
    if (rootActual !== rootExpected) drifts.push("_index.json");
    var bundleExpected = stableStringify(derived.bundle);
    var bundleDest = path.join(outDir, "foundations.bundle.json");
    var bundleActual = fs.existsSync(bundleDest)
      ? fs.readFileSync(bundleDest, "utf-8")
      : "";
    if (bundleActual !== bundleExpected) drifts.push("foundations.bundle.json");
    if (drifts.length === 0) {
      console.log("[derive-foundations] no drift");
      return 0;
    }
    console.error(
      "[derive-foundations] drift detected in: " + drifts.join(", "),
    );
    console.error("Run `npm run derive:foundations` to regenerate.");
    return 1;
  }

  var wr = writeOutputs(
    outDir,
    derived.files,
    derived.bundle,
    derived.rootIndex,
    md,
    sourceRel,
    { skipPrune: args.noPrune },
  );

  if (!args.noManifest) {
    var manifestResult = updatePathsManifest(manifestPath, derived, sourceRel);
    console.log(
      "[derive-foundations] manifest: +" +
        manifestResult.added.length +
        " entries, -" +
        manifestResult.dropped.length +
        " entries",
    );
  }

  console.log(
    "[derive-foundations] wrote " +
      wr.written.length +
      " files to " +
      outDir +
      (wr.removed.length ? " (pruned " + wr.removed.length + " stale)" : ""),
  );
  if (wr.removed.length) {
    console.log("[derive-foundations] pruned: " + wr.removed.join(", "));
  }
  return 0;
}

if (require.main === module) {
  process.exit(runCli(process.argv));
}

module.exports = {
  deriveFromMarkdown,
  concatFoundationsSources,
  buildLeafJson,
  buildIndexJson,
  buildRootIndex,
  buildBundle,
  buildEmissionPlan,
  buildMotionPayload,
  isMotionShape,
  slugifyPatternName,
  extractExplicitPatternAnchor,
  isBoldOnlyParagraph,
  applyStatusToRows,
  extractBodyAndBlocks,
  writeOutputs,
  updatePathsManifest,
  runCli,
  parseArgs,
  SKIP_H2_SLUGS: SKIP_H2_SLUGS,
  SCHEMA_VERSION: SCHEMA_VERSION,
};
