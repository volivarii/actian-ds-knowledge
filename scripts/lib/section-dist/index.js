"use strict";

// Agnostic section-dist emission engine.
//
// This module owns the *domain-agnostic* half of the foundations derive: it
// turns a parsed markdown section tree into the hierarchical Pattern H dist
// shape (per-leaf `<slug>.json`, per-branch `_index.json`, root `_index.json`,
// and the single-file `foundations.bundle.json` roll-up). It knows nothing
// about foundations specifically — the foundations-specific reading,
// concatenation, manifest, flat-index, and CLI logic stay in
// scripts/foundations/derive-foundations.js, which re-exports everything here
// for back-compat.
//
// The Motion functions ride along here: they are shape-triggered (a section is
// only treated as Motion when its H4 children are named Duration/Easing/Delay)
// and therefore inert for any non-motion section. They are part of the generic
// engine, not foundations-specific config.
//
// Relocated from scripts/foundations/derive-foundations.js as a pure move (Task
// 2 of the section-dist refactor) — zero output change; foundations dist stays
// byte-identical.

var astWalk = require("./ast-walk.js");
var extractors = require("./extractors.js");
var statusEmoji = require("./status-emoji.js");

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

function buildMotionPayload(contentTokens, sectionLabel, logger, sectionLevel) {
  // Motion sub-headings (Duration/Easing/Delay/Component Motion Guide) live two
  // heading levels below the emitted top-level section. Default sectionLevel 2
  // → motion section is an H3 leaf, its sub-headings H4 (2 + 2). With
  // sectionLevel:1 they would be H3 (1 + 2). Default 2 keeps depth === 4.
  sectionLevel = sectionLevel || 2;
  var motionSubDepth = sectionLevel + 2;
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

    if (tok.type === "heading" && tok.depth === motionSubDepth) {
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
function buildLeafJson(
  node,
  pathSegments,
  parentId,
  sourceRel,
  logger,
  sectionLevel,
) {
  sectionLevel = sectionLevel || 2;
  // Motion exception: structured payload at H3 level.
  if (isMotionShape(node)) {
    var motionTokens = flattenSectionContent(node);
    var motionPayload = buildMotionPayload(
      motionTokens,
      node.title,
      logger,
      sectionLevel,
    );
    var motionLeaf = {
      _schema_version: SCHEMA_VERSION,
      id: pathSegments.join("/"),
      title: node.title,
      path: pathSegments,
      parent: parentId,
      kind: "motion",
      anchors: anchorsFromPath(pathSegments, sectionLevel),
      source: {
        file: sourceRel,
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
    anchors: anchorsFromPath(pathSegments, sectionLevel),
    source: {
      file: sourceRel,
    },
    _meta: metaBlock(sourceRel),
  };
  if (bb.body) leaf.body = bb.body;
  if (bb.blocks.length) leaf.blocks = bb.blocks;
  return leaf;
}

function buildIndexJson(
  node,
  pathSegments,
  parentId,
  sourceRel,
  logger,
  sectionLevel,
) {
  sectionLevel = sectionLevel || 2;
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
    anchors: anchorsFromPath(pathSegments, sectionLevel),
    source: {
      file: sourceRel,
    },
    children: children,
    _meta: metaBlock(sourceRel),
  };
  if (bb.body) idx.body = bb.body;
  if (bb.blocks.length) idx.blocks = bb.blocks;
  return idx;
}

function anchorsFromPath(pathSegments, sectionLevel) {
  // Anchors keyed by depth level. The h1 anchor is the doc's H1 slug; we
  // capture it from a known constant — the doc-root id is set by the emitter.
  // For schema simplicity we just return a path-segment-keyed map: each
  // segment becomes its own anchor at depth N. The top-level segment (index 0)
  // is keyed "h{sectionLevel}" — default sectionLevel 2 → "h2", unchanged.
  var lvl = sectionLevel || 2;
  var out = {};
  for (var i = 0; i < pathSegments.length; i++) {
    out["h" + (i + lvl)] = pathSegments[i]; // segment 0 → "h{sectionLevel}"
  }
  return out;
}

// Recursive tree → filesystem map. Returns:
//   { files: { "<rel>": <json> }, leafs: [<leafMeta>...], indexes: [<idxMeta>...], bundleTree: <nested object> }
//
// `files` is a flat map keyed by repo-root-relative path.
function buildEmissionPlan(rootNodes, sourceRel, logger, sectionLevel) {
  sectionLevel = sectionLevel || 2;
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
        sectionLevel,
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
      sectionLevel,
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
// Frontmatter ref attachment — P8 transversal taxonomy closure
// ───────────────────────────────────────────────────────────────────────────
//
// Source files may carry optional YAML frontmatter with `a11y_refs` +
// `motion_refs` ref arrays (same shape as
// components/src/categories/<slug>.md). When present, the refs attach to the
// file's top-level H2 node in the emitted dist — branch sections land on
// `<topSlug>/_index.json`, leaf sections on `<topSlug>.json`. Bundle reflects
// the attachment automatically (shared object reference with files map).
//
// Refs are FILE-SCOPED (Option A — coarser than per-section but zero
// authoring overhead): all refs in a file apply to the file's H2 as a whole.
// Subsection precision (per H3/H4 attachment) is intentionally deferred to a
// future Option B pass.

var REF_KEYS = ["a11y_refs", "motion_refs"];

function attachFrontmatterRefs(files, frontmattersByTopSlug, logger) {
  // `files` and `bundleTree` share object references (see buildEmissionPlan —
  // each top-level slug's _index.json or leaf .json IS the same object the
  // bundle holds); mutating the entry here is reflected in the bundle output
  // without an explicit second pass.
  Object.keys(frontmattersByTopSlug).forEach(function (slug) {
    var fm = frontmattersByTopSlug[slug];
    var target = null;
    // Branch: <slug>/_index.json. Leaf: <slug>.json.
    if (files[slug + "/_index.json"]) target = files[slug + "/_index.json"];
    else if (files[slug + ".json"]) target = files[slug + ".json"];
    if (!target) {
      logger.warn(
        "Frontmatter targeting H2 '" +
          slug +
          "' has no matching emit (neither <slug>/_index.json nor <slug>.json). " +
          "Refs dropped.",
      );
      return;
    }
    REF_KEYS.forEach(function (key) {
      var arr = fm[key];
      if (!Array.isArray(arr) || arr.length === 0) return;
      target[key] = arr;
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Root _index.json — top-level metadata
// ───────────────────────────────────────────────────────────────────────────

// `rootAnchor` is the doc-root H1 anchor slug. It is domain-specific (the
// foundations doc anchors its H1 as "foundations" regardless of the H1 title
// text "Actian Design Foundation"), so the emitter passes it explicitly. When
// absent it defaults to "foundations" — preserving the historical foundations
// output byte-identically without requiring the foundations caller to change.
// Non-foundations consumers (e.g. accessibility) MUST pass their own
// `rootAnchor` (e.g. "accessibility") so the root index isn't mislabeled.
function buildRootIndex(rootNodes, sourceRel, h1Title, rootAnchor) {
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
    anchors: { h1: rootAnchor || "foundations" },
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
//
// `deriveFromMarkdown(mdSource, opts)` → { files, leafs, indexes, rootIndex,
// bundle, tree }. opts: { sourceRel, skipH2Slugs, frontmattersByTopSlug,
// rootAnchor, logger }. `skipH2Slugs` defaults to `{}` (no skipping) — the
// engine is agnostic; the foundations consumer injects its own SKIP_H2_SLUGS
// default (see scripts/foundations/derive-foundations.js). `rootAnchor` is the
// doc-root H1 anchor slug (defaults to "foundations" for byte-identical
// back-compat; non-foundations consumers pass their domain slug).

function deriveFromMarkdown(mdSource, opts) {
  opts = opts || {};
  var logger = opts.logger || { warn: function () {} };
  var sourceRel = opts.sourceRel || "foundations/src/";
  var skipMap = opts.skipH2Slugs || {};
  // Emit top-level sections at this heading depth (default 2 → H2s are the
  // emitted top-level sections; H1 is the document root — byte-identical for
  // every current caller, which never passes sectionLevel). See buildSectionTree.
  var sectionLevel = opts.sectionLevel || 2;

  var tokens = astWalk.parseMarkdown(mdSource);
  var tree = astWalk.buildSectionTree(tokens, {
    skipH2Slugs: skipMap,
    sectionLevel: sectionLevel,
  });

  // Find H1 title for root metadata.
  var h1Title = "Foundations";
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "heading" && tokens[i].depth === 1) {
      h1Title = String(tokens[i].text || "").trim();
      break;
    }
  }

  var plan = buildEmissionPlan(tree, sourceRel, logger, sectionLevel);
  if (opts.frontmattersByTopSlug) {
    attachFrontmatterRefs(plan.files, opts.frontmattersByTopSlug, logger);
  }
  var rootIndex = buildRootIndex(tree, sourceRel, h1Title, opts.rootAnchor);
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

module.exports = {
  deriveFromMarkdown: deriveFromMarkdown,
  buildEmissionPlan: buildEmissionPlan,
  buildLeafJson: buildLeafJson,
  buildIndexJson: buildIndexJson,
  buildRootIndex: buildRootIndex,
  buildBundle: buildBundle,
  anchorsFromPath: anchorsFromPath,
  extractBodyAndBlocks: extractBodyAndBlocks,
  metaBlock: metaBlock,
  metaBlockDoNotEditText: metaBlockDoNotEditText,
  attachFrontmatterRefs: attachFrontmatterRefs,
  applyStatusToRows: applyStatusToRows,
  looksLikeMalformedTable: looksLikeMalformedTable,
  // Motion helpers (shape-triggered; inert for non-motion sections).
  isMotionShape: isMotionShape,
  buildMotionPayload: buildMotionPayload,
  flattenSectionContent: flattenSectionContent,
  slugifyPatternName: slugifyPatternName,
  canonicalSlugForPattern: canonicalSlugForPattern,
  isPatternSubsectionLabel: isPatternSubsectionLabel,
  extractExplicitPatternAnchor: extractExplicitPatternAnchor,
  isBoldOnlyParagraph: isBoldOnlyParagraph,
  decodeHtmlEntities: decodeHtmlEntities,
  SCHEMA_VERSION: SCHEMA_VERSION,
  // Re-export the parser sub-modules for consumers that want the whole engine
  // surface from one entry point.
  astWalk: astWalk,
  extractors: extractors,
  statusEmoji: statusEmoji,
};
