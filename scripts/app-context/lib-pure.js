"use strict";
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

function splitFrontmatter(text) {
  const m = String(text).match(FRONTMATTER_RE);
  if (!m) throw new Error("splitFrontmatter: no frontmatter block");
  const data = YAML.parse(m[1]) || {};
  const raw = m[2] || "";
  const body = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  return { data, body };
}

function parseBodySections(body) {
  const sections = [];
  let current = null;
  for (const rawLine of String(body || "").split("\n")) {
    const h2 = rawLine.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      current = { title: h2[1], lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(rawLine);
    }
  }
  for (const s of sections) {
    while (s.lines.length && s.lines[0].trim() === "") s.lines.shift();
    while (s.lines.length && s.lines[s.lines.length - 1].trim() === "")
      s.lines.pop();
  }
  return sections;
}

function sectionProse(lines) {
  return lines
    .filter((l) => l.trim() !== "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionBullets(lines) {
  return lines
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim());
}

function markdownToRecord(text, opts) {
  opts = opts || {};
  const { data, body } = splitFrontmatter(text);
  if (opts.bodyField) data[opts.bodyField] = body;
  return data;
}

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

module.exports = { recordToMarkdown, markdownToRecord, splitFrontmatter, parseBodySections, sectionProse, sectionBullets, stableStringify };
