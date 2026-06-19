"use strict";
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

// Serialize a record to a per-record markdown file: a yaml-language-server
// directive, the structured frontmatter, then an optional prose body (the
// single long-text field, e.g. `description`). Uses full YAML so the output
// matches what the Knowledge Editor's yamlSerializer writes on save.
function recordToMarkdown(record, opts) {
  opts = opts || {};
  const bodyField = opts.bodyField;
  const fm = Object.assign({}, record);
  let body = "";
  if (bodyField && Object.prototype.hasOwnProperty.call(fm, bodyField)) {
    body = String(fm[bodyField] || "");
    delete fm[bodyField];
  }
  const directive = opts.schemaRelPath
    ? `# yaml-language-server: $schema=${opts.schemaRelPath}\n`
    : "";
  const yamlText = YAML.stringify(fm); // trailing newline included
  return `---\n${directive}${yamlText}---\n${body ? body + "\n" : ""}`;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function markdownToRecord(text, opts) {
  opts = opts || {};
  const m = text.match(FRONTMATTER_RE);
  if (!m) throw new Error("markdownToRecord: no frontmatter block");
  const record = YAML.parse(m[1]) || {};
  const body = (m[2] || "").trim();
  if (opts.bodyField) record[opts.bodyField] = body;
  return record;
}

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

function writeAtomic(absPath, contents) {
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, contents);
}

module.exports = { recordToMarkdown, markdownToRecord, stableStringify, writeAtomic };
