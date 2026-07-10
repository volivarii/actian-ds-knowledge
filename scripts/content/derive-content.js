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
//   {writing,patterns,product}.md — per-bucket split views of the same
//               global sections, so a consumer that needs only one family
//               (e.g. writing rules) reads that file instead of the full
//               concat. Root-level meta files (global-guidelines.md etc.)
//               have no bucket and appear only in global.md. The split is a
//               parallel change (MIGRATIONS.md Rule 1): global.md keeps its
//               shape and consumers; only empty-body stub sections stopped
//               being emitted (see withProse).
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

var frontmatter = require("../lib/frontmatter");
var writeAtomic = require("../lib/dist-io").writeAtomic;

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
  var wordsToAvoidOut = path.join(ROOT, "content/dist/words-to-avoid.json");
  var bucketOuts = {};
  CONTENT_SUB_BUCKETS.forEach(function (bucket) {
    bucketOuts[bucket] = path.join(ROOT, "content/dist/" + bucket + ".md");
  });
  return {
    src: src,
    index: indexArg,
    globalOut: globalOut,
    bucketOuts: bucketOuts,
    wordsToAvoidOut: wordsToAvoidOut,
  };
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

// STEP 4: words-to-avoid data is typed frontmatter, not a body table.
// Pure reshaper — validates required fields and lowercases avoid tokens.
// Guard required fields (clear error, not an opaque TypeError) + lowercase
// the avoid tokens (honors the schema's "Lowercased" contract) + fix key order.
function normalizeWordsToAvoidRules(rawRules) {
  if (!Array.isArray(rawRules) || rawRules.length === 0) {
    throw new Error("words-to-avoid: no `wordsToAvoid` frontmatter rules");
  }
  return rawRules.map(function (r, i) {
    if (
      !r ||
      !Array.isArray(r.avoid) ||
      typeof r.reason !== "string" ||
      !r.example ||
      typeof r.example.do !== "string" ||
      typeof r.example.dont !== "string"
    ) {
      throw new Error(
        "words-to-avoid: malformed rule at index " +
          i +
          " (need avoid[], reason, example.{do,dont})",
      );
    }
    return {
      avoid: r.avoid.map(function (t) {
        return String(t).toLowerCase();
      }),
      reason: r.reason,
      example: { do: r.example.do, dont: r.example.dont },
    };
  });
}

// Read the rules in source order; reshape to the dist rule key-order
// {avoid, reason, example:{do,dont}} so JSON.stringify is byte-identical.
function readWordsToAvoidRules(config) {
  var srcFile = path.join(config.src, "writing", "words-to-avoid.md");
  if (!fs.existsSync(srcFile)) {
    throw new Error(
      "words-to-avoid source not found: " + path.relative(ROOT, srcFile),
    );
  }
  var data = frontmatter.parse(fs.readFileSync(srcFile, "utf8")).data;
  return normalizeWordsToAvoidRules(data && data.wordsToAvoid);
}

// A reason/example may contain `|` or newlines once authored via the editor;
// escape them so a cell can't break the Markdown table. No-op on current data.
function mdCell(s) {
  return String(s)
    .replace(/\r?\n+/g, " ")
    .replace(/\|/g, "\\|");
}

// Render the rules back into the markdown section that lives in global.md:
// the `---` separator + the Do/Don't table (reproducing the committed bytes,
// including the 3-column `|---|---|---|` separator).
function renderWordsToAvoidSection(rules) {
  var lines = ["---", "", "| Example | Do | Don't |", "|---|---|---|"];
  rules.forEach(function (r) {
    lines.push(
      "| " +
        mdCell(r.reason) +
        " | " +
        mdCell(r.example.do) +
        " | " +
        mdCell(r.example.dont) +
        " |",
    );
  });
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
      bucket: resolved.bucket,
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

// STEP 4: the words-to-avoid table now lives in frontmatter; its prose-only
// body is mirrored as usual, then the table is re-rendered from the rules.
// Read lazily so callers don't require words-to-avoid.md when no such
// section is present in their section list. Shared by the global concat and
// the writing bucket split so the two can never render the table differently.
function applyWordsToAvoidTable(sections, config) {
  return sections.map(function (s) {
    if (s.slug !== "words-to-avoid") return s;
    return {
      slug: s.slug,
      title: s.title,
      scope: s.scope,
      bucket: s.bucket,
      body:
        s.body +
        "\n\n" +
        renderWordsToAvoidSection(readWordsToAvoidRules(config)),
    };
  });
}

// A frontmatter-only stub (e.g. patterns/loading-and-progress.md, which
// carries fan-out frontmatter but no prose yet) cleans to an empty body.
// Emitting it produced a malformed empty `---` block in the doc, so drop
// empty bodies before assembly. The stub stays in the index and keeps
// feeding the guideline fan-out; it just contributes no concat block.
function withProse(sections) {
  return sections.filter(function (s) {
    return s.body.length > 0;
  });
}

// Header boilerplate shared verbatim by the global concat and every bucket
// split, so the provenance framing can never drift between them. Callers
// supply the title and the scope line(s); Sources/Authoring lines follow.
function docHeader(config, title, scopeLines, sourcesGlob, sectionCount) {
  return [title, ""]
    .concat([
      "> **Auto-generated** by `scripts/content/derive-content.js`. Do not edit " +
        "this file directly — edit the per-section source files.",
      ">",
    ])
    .concat(scopeLines)
    .concat([
      "> **Sources** (" + sectionCount + " sections): " + sourcesGlob,
      "> **Authoring guide:** `" +
        path.relative(ROOT, config.src) +
        "/AUTHORING.md`",
    ]);
}

// Global / cross-cutting topics only — the docs /content page consumes this.
function buildGlobalOutput(config) {
  var sections = withProse(
    applyWordsToAvoidTable(
      resolveAllSections(config).filter(function (s) {
        return s.scope === "global";
      }),
      config,
    ),
  );
  var header = docHeader(
    config,
    "# Content guidelines — global topics",
    [
      "> **Scope:** cross-cutting writing guidance (voice, tone, capitalization, " +
        "words to avoid) and UX-pattern topics. Component-scoped content guidance " +
        "lives per-component in `components/dist/guidelines/{slug}.json` instead.",
    ],
    "`" +
      path.relative(ROOT, config.src) +
      "/{bucket}/{slug}.md` where bucket is one of writing, patterns, " +
      "product (plus `global-guidelines.md` at the root).",
    sections.length,
  );
  return assembleDoc(header, sections);
}

// One bucket's split view of the same global sections, in index order.
// Root-level meta files (bucket null) are global.md-only by design: they are
// cross-bucket ground rules, not members of any one family.
function buildBucketOutput(config, bucket) {
  if (CONTENT_SUB_BUCKETS.indexOf(bucket) === -1) {
    throw new Error(
      "unknown content bucket '" +
        bucket +
        "' (known: " +
        CONTENT_SUB_BUCKETS.join(", ") +
        ")",
    );
  }
  var sections = withProse(
    applyWordsToAvoidTable(
      resolveAllSections(config).filter(function (s) {
        return s.scope === "global" && s.bucket === bucket;
      }),
      config,
    ),
  );
  // A bucket with zero prose sections is a config error (sources moved or a
  // bucket added to CONTENT_SUB_BUCKETS before any source exists): fail loud
  // instead of committing a header-only dist file that llms.txt and the
  // manifest keep advertising.
  if (sections.length === 0) {
    throw new Error(
      "bucket '" +
        bucket +
        "' resolved to zero prose sections — " +
        "empty bucket dist files are not emitted; check content/src/" +
        bucket +
        "/ and content-index.md",
    );
  }
  var header = docHeader(
    config,
    "# Content guidelines: " + bucket + " topics",
    [
      "> **Scope:** the `" +
        bucket +
        "` bucket of the global content guidelines, split out so a consumer " +
        "that needs only this family reads only this file. The full " +
        "cross-bucket document (including the root-level ground rules) is " +
        "`content/dist/global.md`.",
    ],
    "`" + path.relative(ROOT, config.src) + "/" + bucket + "/{slug}.md`.",
    sections.length,
  );
  return assembleDoc(header, sections);
}

function buildWordsToAvoid(config) {
  return {
    _schema_version: 1,
    _source: "content/src/writing/words-to-avoid.md",
    rules: readWordsToAvoidRules(config),
  };
}

function main(argv) {
  var args = parseArgs(argv);
  var config = resolveConfig(args);
  var outDir = path.dirname(config.globalOut);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // writeAtomic (temp + rename) for every dist write, matching the sibling
  // derivers: a concurrent reader (parallel test process) must never see a
  // half-written file.
  var globalOut = buildGlobalOutput(config);
  writeAtomic(config.globalOut, globalOut);

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

  CONTENT_SUB_BUCKETS.forEach(function (bucket) {
    var bucketOut = buildBucketOutput(config, bucket);
    writeAtomic(config.bucketOuts[bucket], bucketOut);
    console.log(
      "[derive-content] wrote " +
        path.relative(ROOT, config.bucketOuts[bucket]) +
        " (" +
        bucketOut.split("\n").length +
        " lines)",
    );
  });

  var wta = buildWordsToAvoid(config);
  writeAtomic(config.wordsToAvoidOut, JSON.stringify(wta, null, 2) + "\n");
  console.log(
    "[derive-content] wrote " +
      path.relative(ROOT, config.wordsToAvoidOut) +
      " (" +
      wta.rules.length +
      " rules)",
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
  normalizeWordsToAvoidRules: normalizeWordsToAvoidRules,
  readWordsToAvoidRules: readWordsToAvoidRules,
  mdCell: mdCell,
  renderWordsToAvoidSection: renderWordsToAvoidSection,
  buildWordsToAvoid: buildWordsToAvoid,
  resolveSectionFile: resolveSectionFile,
  readSection: readSection,
  resolveAllSections: resolveAllSections,
  buildGlobalOutput: buildGlobalOutput,
  buildBucketOutput: buildBucketOutput,
};
