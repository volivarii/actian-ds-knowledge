"use strict";

// Builds the consolidated content guidelines from per-section source files.
// Section order comes from the index file's "All sections" anchors
// (<a href="slug">Title</a>). To reorder sections, edit the index —
// the generator follows.
//
// Two outputs are written to the same dist directory:
//   content.md  — full concat: global topics + component-scoped content
//                 (transitional, for consumers not yet migrated; retired
//                 in a later phase).
//   global.md   — global / cross-cutting topics only (the docs /content
//                 page + LLM-agent skills consume this).
//
// Sources resolve from two locations (Phase 2b):
//   - component-scoped content → components/src/<slug>/content.md
//   - global / cross-cutting   → content/src/<slug>.md
//
// Run:
//   npm run derive:content
//   node scripts/content/derive-content.js \
//     --src content/src --index content/src/content-index.md \
//     --out content/dist/content.md
//
// `--out` sets the content.md path; global.md is always written as its
// sibling in the same directory. Both files are emitted every run.

var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..", "..");

var KNOWN_FLAGS = ["src", "index", "out"];

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
  var out = args.out
    ? path.resolve(ROOT, args.out)
    : path.join(ROOT, "content/dist/content.md");
  return { src: src, index: indexArg, out: out };
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

// Full consolidated content.md — global topics + component-scoped content.
function buildOutput(config) {
  var sections = resolveAllSections(config);
  var header = [
    "# Content guidelines — Actian Data Intelligence",
    "",
    "> **Auto-generated** by `scripts/content/derive-content.js`. Do not edit " +
      "this file directly — edit the per-section source files.",
    ">",
    "> **Sources** (" +
      sections.length +
      " sections): component-scoped content lives in " +
      "`components/src/{slug}/content.md`; global / cross-cutting topics live " +
      "in `" +
      path.relative(ROOT, config.src) +
      "/{slug}.md`.",
    "> **Section order:** `" +
      path.relative(ROOT, config.index) +
      '` ("All sections" anchors)',
    "> **Authoring guides:** `components/src/AUTHORING.md` (per-component) · `" +
      path.relative(ROOT, config.src) +
      "/AUTHORING.md` (global)",
  ];
  return assembleDoc(header, sections);
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
      "/{slug}.md`.",
    "> **Authoring guide:** `" +
      path.relative(ROOT, config.src) +
      "/AUTHORING.md`",
  ];
  return assembleDoc(header, sections);
}

function main(argv) {
  var args = parseArgs(argv);
  var config = resolveConfig(args);
  var outDir = path.dirname(config.out);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  var contentOut = buildOutput(config);
  fs.writeFileSync(config.out, contentOut);

  var globalPath = path.join(outDir, "global.md");
  var globalOut = buildGlobalOutput(config);
  fs.writeFileSync(globalPath, globalOut);

  [config.out, globalPath].forEach(function (p) {
    var stats = fs.statSync(p);
    var lineCount = fs.readFileSync(p, "utf8").split("\n").length;
    console.log(
      "[derive-content] wrote " +
        path.relative(ROOT, p) +
        " (" +
        stats.size +
        " bytes, " +
        lineCount +
        " lines)",
    );
  });
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
  parseArgs: parseArgs,
  resolveConfig: resolveConfig,
  readSectionOrder: readSectionOrder,
  stripFrontmatter: stripFrontmatter,
  stripJekyllAttrs: stripJekyllAttrs,
  collapseBlankLines: collapseBlankLines,
  shiftHeadings: shiftHeadings,
  resolveSectionFile: resolveSectionFile,
  readSection: readSection,
  resolveAllSections: resolveAllSections,
  buildOutput: buildOutput,
  buildGlobalOutput: buildGlobalOutput,
};
