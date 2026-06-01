"use strict";

// Builds the consolidated content guidelines from per-section source files.
// Section order comes from the index file's "All sections" anchors
// (<a href="slug">Title</a>). To reorder sections, edit the index —
// the generator follows.
//
// Output:
//   global.md — global / cross-cutting topics only (the docs /content
//               page + LLM-agent skills consume this). Component-scoped
//               content lives per-component in
//               components/dist/guidelines/<slug>.json `domains.content`.
//
// Phase 5 (knowledge v0.11.0): the transitional `content.md` full-concat
// was retired. Consumers migrated to `global.md` + per-component
// guideline docs. See `.github/workflows/retired-layer-guard.yml`.
//
// Sources resolve from three locations (Phase 2c):
//   - component-scoped content → components/src/<slug>/content.md
//                                (NOT emitted into global.md; lives in
//                                 dist/guidelines/<slug>.json instead)
//   - global, in a sub-bucket  → content/src/{writing,patterns,product}/<slug>.md
//   - root-level meta files    → content/src/<slug>.md (global-guidelines.md, etc.)
//
// Run:
//   npm run derive:content
//   node scripts/content/derive-content.js \
//     --src content/src --index content/src/content-index.md

var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..", "..");

var KNOWN_FLAGS = ["src", "index"];

function parseArgs(argv) {
  var out = {};
  for (var i = 0; i < argv.length; i++) {
    var token = argv[i];
    if (token.indexOf("--") !== 0) continue;
    var key = token.replace(/^--/, "");
    if (KNOWN_FLAGS.indexOf(key) === -1) {
      throw new Error(
        "unknown flag --" + key + " (known: " + KNOWN_FLAGS.join(", ") + ")",
      );
    }
    var value = argv[i + 1];
    if (value === undefined || value.indexOf("--") === 0) {
      throw new Error("flag --" + key + " requires a value");
    }
    out[key] = value;
    i++;
  }
  return out;
}

function resolveConfig(args) {
  var src = args.src
    ? path.resolve(ROOT, args.src)
    : path.join(ROOT, "content/src");
  var indexArg = args.index
    ? path.resolve(ROOT, args.index)
    : path.join(src, "content-index.md");
  var globalOut = path.join(ROOT, "content/dist/global.md");
  return { src: src, index: indexArg, globalOut: globalOut };
}

function readSectionOrder(indexFile) {
  if (!fs.existsSync(indexFile)) {
    throw new Error("index file not found: " + path.relative(ROOT, indexFile));
  }
  var md = fs.readFileSync(indexFile, "utf8");
  // Local regex — avoid module-scoped /g state across calls.
  var hrefRe = /<a href="([^"]+)">([^<]+)<\/a>/g;
  var order = [];
  var seen = new Set();
  var m;
  while ((m = hrefRe.exec(md))) {
    var slug = m[1].trim();
    var title = m[2].trim();
    if (seen.has(slug)) continue;
    seen.add(slug);
    order.push({ slug: slug, title: title });
  }
  if (order.length === 0) {
    throw new Error(
      path.relative(ROOT, indexFile) +
        ': no <a href="slug">Title</a> entries found',
    );
  }
  return order;
}

function stripFrontmatter(s) {
  return s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function stripJekyllAttrs(s) {
  // Strip the attribute line AND its trailing newline so we don't leave
  // an orphan blank line where it used to be.
  return s.replace(/^\s*\{:\s*[^}]+\}\s*\r?\n?/gm, "");
}

function collapseBlankLines(s) {
  // Normalize runs of 3+ newlines to exactly 2 (one blank line).
  return s.replace(/\n{3,}/g, "\n\n");
}

function shiftHeadings(s) {
  var lines = s.split("\n");
  var inCode = false;
  for (var i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    var match = lines[i].match(/^(#{1,6}) (.*)$/);
    if (!match) continue;
    var hashes = match[1];
    if (hashes.length >= 6) continue;
    lines[i] = "#" + hashes + " " + match[2];
  }
  return lines.join("\n");
}

// Parse a markdown "Words to avoid" Do/Don't table into structured rules.
// The table is `| <rule note> | <Do example> | <Don't example> |`. The
// literal avoid tokens are the double-quoted terms inside the note column;
// rows with no quoted term are advisory (avoid: []). Throws if no data
// rows are found. Straight (") and smart (" ") quotes both supported.
// Note: trailing .,;!? is stripped from each token, so dotted abbreviations (e.g. "e.g.") would lose the final dot — fine for the current brand-voice word list.
function parseWordsToAvoid(md) {
  var src = String(md).replace(/\r\n/g, "\n");
  var lines = src.split("\n");
  var dataRows = [];
  var sawHeader = false;
  var inTable = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var isRow = line.charAt(0) === "|" && line.charAt(line.length - 1) === "|";
    if (!isRow) {
      if (inTable) break; // table ended
      continue;
    }
    inTable = true;
    var cells = line
      .slice(1, -1)
      .split("|")
      .map(function (c) {
        return c.trim();
      });
    if (!sawHeader) {
      sawHeader = true; // first table row is the header — skip it
      continue;
    }
    var isSeparator = cells.every(function (c) {
      return /^:?-+:?$/.test(c);
    });
    if (isSeparator) continue;
    if (cells.length < 3) continue;
    dataRows.push(cells);
  }
  if (dataRows.length === 0) {
    throw new Error("words-to-avoid: no table rows found in source");
  }
  var quoteRe = /["“”]([^"“”]+)["“”]/g;
  return dataRows.map(function (cells) {
    var note = cells[0];
    var avoid = [];
    quoteRe.lastIndex = 0;
    var m;
    while ((m = quoteRe.exec(note)) !== null) {
      var term = m[1]
        .trim()
        .toLowerCase()
        .replace(/[.,;!?]+$/, "");
      if (term) avoid.push(term);
    }
    return {
      avoid: avoid,
      reason: note,
      example: { do: cells[1], dont: cells[2] },
    };
  });
}

// Sub-buckets we walk inside content/src/. Order is not significant
// (a given slug exists in at most one bucket). Adding a bucket means
// editing this list. Files at content/src/ root (meta files like
// global-guidelines.md) resolve with bucket: null.
var CONTENT_SUB_BUCKETS = ["writing", "patterns", "product"];

// Resolve the source file for a content-index slug, tagging its scope.
// Component-scoped content lives in the per-component guideline layout
// (`components/src/<slug>/content.md`, Phase 2a); global / cross-cutting
// topics live under `content/src/` either in a sub-bucket
// (`writing/`, `patterns/`, `product/`) or flat at the root (meta files
// like `global-guidelines.md`).
// Returns { file, scope, bucket } where scope is "component" | "global"
// and bucket is one of CONTENT_SUB_BUCKETS or null, or null overall.
function resolveSectionFile(srcDir, slug) {
  // Component-scoped content lives per-component (Phase 2a).
  var componentCandidate = path.join(
    ROOT,
    "components",
    "src",
    slug,
    "content.md",
  );
  if (fs.existsSync(componentCandidate)) {
    return { file: componentCandidate, scope: "component", bucket: null };
  }

  // Sub-bucketed global content (writing/, patterns/, product/).
  for (var i = 0; i < CONTENT_SUB_BUCKETS.length; i++) {
    var bucket = CONTENT_SUB_BUCKETS[i];
    var bucketCandidate = path.join(srcDir, bucket, slug + ".md");
    if (fs.existsSync(bucketCandidate)) {
      return { file: bucketCandidate, scope: "global", bucket: bucket };
    }
  }

  // Root-level meta files (global-guidelines.md, content-index.md, format-spec.md).
  var rootCandidate = path.join(srcDir, slug + ".md");
  if (fs.existsSync(rootCandidate)) {
    return { file: rootCandidate, scope: "global", bucket: null };
  }

  return null;
}

function cleanSectionFile(file) {
  var s = fs.readFileSync(file, "utf8");
  s = s.replace(/\r\n/g, "\n");
  s = stripFrontmatter(s);
  s = stripJekyllAttrs(s);
  s = collapseBlankLines(s);
  s = s.trim();
  s = shiftHeadings(s);
  return s;
}

// Returns the cleaned section body string, or null if no source exists.
function readSection(srcDir, slug) {
  var resolved = resolveSectionFile(srcDir, slug);
  if (!resolved) return null;
  return cleanSectionFile(resolved.file);
}

// Resolve every ordered section to { slug, title, body, scope }. Throws if
// any indexed slug has no source file.
function resolveAllSections(config) {
  var order = readSectionOrder(config.index);
  var sections = [];
  var missing = [];
  for (var i = 0; i < order.length; i++) {
    var resolved = resolveSectionFile(config.src, order[i].slug);
    if (!resolved) {
      missing.push(order[i].slug);
      continue;
    }
    sections.push({
      slug: order[i].slug,
      title: order[i].title,
      body: cleanSectionFile(resolved.file),
      scope: resolved.scope,
    });
  }
  if (missing.length > 0) {
    throw new Error(
      "Missing source files for " +
        missing.length +
        " section(s) referenced in " +
        path.relative(ROOT, config.index) +
        ": " +
        missing.join(", "),
    );
  }
  return sections;
}

// Assemble a doc from a header block + section bodies, `---`-separated,
// with no trailing separator.
function assembleDoc(headerLines, sections) {
  var lines = headerLines.slice();
  lines.push("");
  lines.push("---");
  lines.push("");
  for (var i = 0; i < sections.length; i++) {
    lines.push(sections[i].body);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  while (
    lines.length &&
    (lines[lines.length - 1] === "" || lines[lines.length - 1] === "---")
  ) {
    lines.pop();
  }
  lines.push("");
  return lines.join("\n");
}

// Global / cross-cutting topics only — the docs /content page consumes this.
function buildGlobalOutput(config) {
  var sections = resolveAllSections(config).filter(function (s) {
    return s.scope === "global";
  });
  var header = [
    "# Content guidelines — global topics",
    "",
    "> **Auto-generated** by `scripts/content/derive-content.js`. Do not edit " +
      "this file directly — edit the per-section source files.",
    ">",
    "> **Scope:** cross-cutting writing guidance (voice, tone, capitalization, " +
      "words to avoid) and UX-pattern topics. Component-scoped content guidance " +
      "lives per-component in `components/dist/guidelines/{slug}.json` instead.",
    "> **Sources** (" +
      sections.length +
      " sections): `" +
      path.relative(ROOT, config.src) +
      "/{bucket}/{slug}.md` where bucket is one of writing, patterns, " +
      "product (plus `global-guidelines.md` at the root).",
    "> **Authoring guide:** `" +
      path.relative(ROOT, config.src) +
      "/AUTHORING.md`",
  ];
  return assembleDoc(header, sections);
}

function main(argv) {
  var args = parseArgs(argv);
  var config = resolveConfig(args);
  var outDir = path.dirname(config.globalOut);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  var globalOut = buildGlobalOutput(config);
  fs.writeFileSync(config.globalOut, globalOut);

  var stats = fs.statSync(config.globalOut);
  var lineCount = fs.readFileSync(config.globalOut, "utf8").split("\n").length;
  console.log(
    "[derive-content] wrote " +
      path.relative(ROOT, config.globalOut) +
      " (" +
      stats.size +
      " bytes, " +
      lineCount +
      " lines)",
  );
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error("[derive-content] FAILED: " + err.message);
    process.exit(1);
  }
}

module.exports = {
  KNOWN_FLAGS: KNOWN_FLAGS,
  CONTENT_SUB_BUCKETS: CONTENT_SUB_BUCKETS,
  parseArgs: parseArgs,
  resolveConfig: resolveConfig,
  readSectionOrder: readSectionOrder,
  stripFrontmatter: stripFrontmatter,
  stripJekyllAttrs: stripJekyllAttrs,
  collapseBlankLines: collapseBlankLines,
  shiftHeadings: shiftHeadings,
  parseWordsToAvoid: parseWordsToAvoid,
  resolveSectionFile: resolveSectionFile,
  readSection: readSection,
  resolveAllSections: resolveAllSections,
  buildGlobalOutput: buildGlobalOutput,
};
