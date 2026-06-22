#!/usr/bin/env node
"use strict";

// Validates the content domain:
//   - content/src/**/*.md frontmatter against schemas/content.json
//     (excludes README.md + AUTHORING.md; frontmatter is REQUIRED on the rest)
//   - content/dist/words-to-avoid.json against schemas/words-to-avoid.json
// Output: rdjsonl on stdout, summary on stderr. Exit 0 if clean, 1 if any violation.

const fs = require("node:fs");
const path = require("node:path");
const {
  createValidator,
  ajvErrorToRdjsonl,
  emitRdjsonl,
  emitSummary,
} = require("./lib-validator");
const fmLib = require("../lib/frontmatter");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TARGET = path.join(REPO_ROOT, "content", "dist", "words-to-avoid.json");
const EXCLUDE = new Set(["README.md", "AUTHORING.md"]);

function walkMd(dir, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(p, out);
    else if (e.name.endsWith(".md") && !EXCLUDE.has(e.name)) out.push(p);
  }
  return out;
}

function rec(message, rel) {
  return {
    message,
    location: { path: rel, range: { start: { line: 1, column: 1 } } },
    severity: "ERROR",
  };
}

// Validate every content/src/**/*.md (minus README/AUTHORING) frontmatter.
function validateContentSrc(repoRoot = REPO_ROOT) {
  const records = [];
  const validate = createValidator("content.json");
  for (const abs of walkMd(path.join(repoRoot, "content", "src"))) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
    const raw = fs.readFileSync(abs, "utf8");
    if (!raw.startsWith("---")) {
      records.push(rec("content/src doc missing frontmatter (--- fence required)", rel));
      continue;
    }
    let data;
    try {
      data = fmLib.parse(raw).data;
    } catch (e) {
      records.push(rec("Frontmatter parse error: " + e.message, rel));
      continue;
    }
    if (!validate(data)) {
      for (const err of validate.errors || []) records.push(ajvErrorToRdjsonl(err, rel));
    }
  }
  return records;
}

function run() {
  const records = validateContentSrc(REPO_ROOT);
  let skipped = false;
  if (!fs.existsSync(TARGET)) {
    skipped = true; // words-to-avoid.json dist check skipped (not present)
  } else {
    const rel = path.relative(REPO_ROOT, TARGET);
    const validate = createValidator("words-to-avoid.json");
    let data = null;
    try {
      data = JSON.parse(fs.readFileSync(TARGET, "utf8"));
    } catch (e) {
      records.push(rec("Invalid JSON: " + e.message, rel));
    }
    if (data && !validate(data)) {
      for (const err of validate.errors || []) records.push(ajvErrorToRdjsonl(err, rel));
    }
  }
  return { invalid: records.length, records, skipped };
}

function main() {
  const r = run();
  r.records.forEach(emitRdjsonl);
  emitSummary(
    "[validate-content] " +
      (r.invalid === 0 ? "valid" : r.invalid + " violation(s)") +
      (r.skipped ? " (words-to-avoid.json absent — dist check skipped)" : ""),
  );
  process.exit(r.invalid === 0 ? 0 : 1);
}

module.exports = { run, validateContentSrc };
if (require.main === module) main();
