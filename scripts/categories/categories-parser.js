"use strict";

// Lightweight YAML frontmatter parser for category-defaults MD files.
//
// PR δ (Phase 2 v2, v0.4.5+).
//
// This is NOT a full YAML implementation. It supports the strict subset used
// by components/src/categories/<slug>.md frontmatter, which is governed by
// schemas/category-defaults.json. Anything outside this subset throws with a
// human-readable error pointing to the offending line.
//
// Supported syntax:
//
//   key: value                       # top-level scalar (string, number, bool, identifier)
//   key:                             # nested object (one level deep, e.g. confidence)
//     subkey: value
//   key: [a, b, c]                   # inline (flow) array of scalars
//   key:                             # block-style array of inline objects
//     - { name: X, description: Y }
//     - { axis: State, values: [a, b, c] }
//
// Comments (# to end of line, outside quoted strings) are stripped.
// Trailing whitespace ignored.
// Quoted strings ("..." or '...') preserve their content verbatim minus the
// quotes; escape sequences are NOT processed (keep authoring simple).
//
// Scalar coercion:
//   - "true" / "false" → boolean
//   - integer / float patterns → number
//   - bare identifiers and unquoted strings → string
//   - empty value after key + indented block follows → nested object marker
//
// Output: plain object. The full document body (everything after the closing
// `---`) is returned separately as `body` for downstream consumers that want
// the freeform MD prose.

// ───────────────────────────────────────────────────────────────────────────
// Frontmatter envelope
// ───────────────────────────────────────────────────────────────────────────

const FENCE = /^---\s*$/;

function splitFrontmatter(source) {
  const lines = source.split(/\r?\n/);
  if (lines.length === 0 || !FENCE.test(lines[0])) {
    throw new Error(
      "Missing opening `---` fence on line 1. Category MDs must start with YAML frontmatter.",
    );
  }
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    throw new Error(
      "Missing closing `---` fence. Add a `---` line after the last frontmatter key.",
    );
  }
  return {
    frontmatter: lines.slice(1, endIdx).join("\n"),
    body: lines
      .slice(endIdx + 1)
      .join("\n")
      .replace(/^\n+/, ""),
    frontmatterLineOffset: 1, // line numbers in frontmatter start at +1
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Tokenization helpers
// ───────────────────────────────────────────────────────────────────────────

function stripComment(line) {
  // Strip `# comment` (only when # is not inside quotes). For the supported
  // subset we don't allow # inside unquoted strings, so this is safe.
  let inQuote = null;
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      out += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      out += ch;
      continue;
    }
    if (ch === "#") break;
    out += ch;
  }
  return out;
}

function indentOf(line) {
  const m = line.match(/^( *)/);
  return m ? m[1].length : 0;
}

function coerceScalar(raw, lineNo) {
  const v = raw.trim();
  if (v === "") return null;
  // Quoted string
  if (
    (v[0] === '"' && v[v.length - 1] === '"') ||
    (v[0] === "'" && v[v.length - 1] === "'")
  ) {
    return v.slice(1, -1);
  }
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  // Bare string (identifier, slug, kebab, ISO date — all fine as strings)
  return v;
}

// Parse an inline array: [a, b, c] or [a, "b c", d]
function parseInlineArray(raw, lineNo) {
  const trimmed = raw.trim();
  if (trimmed[0] !== "[" || trimmed[trimmed.length - 1] !== "]") {
    throw new Error(
      "Line " + lineNo + ": expected inline array [a, b, c], got: " + raw,
    );
  }
  const inner = trimmed.slice(1, -1);
  return splitTopLevel(inner, ",").map((part) => coerceScalar(part, lineNo));
}

// Parse an inline object: { key: value, key2: [a,b], key3: value }
//
// Key-pattern aware splitter: only commas immediately followed by `<key>:`
// terminate an entry. This lets unquoted descriptions contain natural-language
// commas (e.g. `description: receives focus, hover, press states`) without
// requiring authors to quote every prose value.
function parseInlineObject(raw, lineNo) {
  const trimmed = raw.trim();
  if (trimmed[0] !== "{" || trimmed[trimmed.length - 1] !== "}") {
    throw new Error(
      "Line " + lineNo + ": expected inline object { k: v, ... }, got: " + raw,
    );
  }
  const inner = trimmed.slice(1, -1);
  if (inner.trim() === "") return {};
  const parts = splitInlineObjectEntries(inner);
  const obj = {};
  for (const part of parts) {
    const colonIdx = findTopLevelColon(part);
    if (colonIdx === -1) {
      throw new Error(
        "Line " +
          lineNo +
          ": malformed inline object entry (missing `: `): " +
          part.trim(),
      );
    }
    const key = part.slice(0, colonIdx).trim();
    const rest = part.slice(colonIdx + 1).trim();
    obj[key] = parseInlineValue(rest, lineNo);
  }
  return obj;
}

// Split an inline-object body on top-level commas that are immediately
// followed by `<identifier>:`. Comma+space inside prose values is treated
// as part of the value.
function splitInlineObjectEntries(inner) {
  const out = [];
  let depthSquare = 0;
  let depthCurly = 0;
  let inQuote = null;
  let buf = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      buf += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      buf += ch;
      continue;
    }
    if (ch === "[") depthSquare++;
    else if (ch === "]") depthSquare--;
    else if (ch === "{") depthCurly++;
    else if (ch === "}") depthCurly--;

    if (
      ch === "," &&
      depthSquare === 0 &&
      depthCurly === 0 &&
      looksLikeKeyAfter(inner, i + 1)
    ) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0 || out.length > 0) out.push(buf);
  return out;
}

// Returns true if `inner` starting at index `startIdx` (after optional spaces)
// matches `<identifier>:` — i.e., the next chunk is a new key/value entry.
function looksLikeKeyAfter(inner, startIdx) {
  // Skip whitespace
  let i = startIdx;
  while (i < inner.length && /\s/.test(inner[i])) i++;
  // Match identifier chars then `:`
  const idStart = i;
  while (i < inner.length && /[A-Za-z0-9_-]/.test(inner[i])) i++;
  if (i === idStart) return false;
  return inner[i] === ":";
}

function parseInlineValue(raw, lineNo) {
  const v = raw.trim();
  if (v[0] === "[") return parseInlineArray(v, lineNo);
  if (v[0] === "{") return parseInlineObject(v, lineNo);
  return coerceScalar(v, lineNo);
}

// Split `inner` on top-level occurrences of `sep` (commas), respecting nested
// brackets [] / {} and quoted strings.
function splitTopLevel(inner, sep) {
  const out = [];
  let depthSquare = 0;
  let depthCurly = 0;
  let inQuote = null;
  let buf = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      buf += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      buf += ch;
      continue;
    }
    if (ch === "[") depthSquare++;
    else if (ch === "]") depthSquare--;
    else if (ch === "{") depthCurly++;
    else if (ch === "}") depthCurly--;

    if (ch === sep && depthSquare === 0 && depthCurly === 0) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0 || out.length > 0) out.push(buf);
  return out;
}

function findTopLevelColon(str) {
  let depthSquare = 0;
  let depthCurly = 0;
  let inQuote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === "[") depthSquare++;
    else if (ch === "]") depthSquare--;
    else if (ch === "{") depthCurly++;
    else if (ch === "}") depthCurly--;
    if (ch === ":" && depthSquare === 0 && depthCurly === 0) return i;
  }
  return -1;
}

// ───────────────────────────────────────────────────────────────────────────
// Indent-aware document parser
// ───────────────────────────────────────────────────────────────────────────

function parseFrontmatter(frontmatterText, lineOffset) {
  const rawLines = frontmatterText.split(/\r?\n/);
  // Pre-clean: strip comments + trailing whitespace. Preserve indentation.
  // Keep original line numbers so error messages point to the right place.
  const cleaned = rawLines.map((l, idx) => ({
    text: stripComment(l).replace(/\s+$/, ""),
    lineNo: idx + 1 + (lineOffset || 0),
  }));

  // Drop entirely blank lines (after cleanup); they're just spacing.
  const lines = cleaned.filter((l) => l.text.length > 0);

  const result = {};
  let i = 0;
  while (i < lines.length) {
    const consumed = parseTopLevelKey(lines, i, result);
    if (consumed <= 0) {
      throw new Error(
        "Line " + lines[i].lineNo + ": could not parse: " + lines[i].text,
      );
    }
    i += consumed;
  }
  return result;
}

// Parse one top-level key (indent 0) and consume any nested lines. Returns
// the number of lines consumed.
function parseTopLevelKey(lines, startIdx, out) {
  const head = lines[startIdx];
  if (indentOf(head.text) !== 0) {
    throw new Error(
      "Line " +
        head.lineNo +
        ": top-level keys must start at column 1 (no leading spaces).",
    );
  }
  const colonIdx = findTopLevelColon(head.text);
  if (colonIdx === -1) {
    throw new Error(
      "Line " +
        head.lineNo +
        ": expected `key: value` or `key:` at top level, got: " +
        head.text,
    );
  }
  const key = head.text.slice(0, colonIdx).trim();
  const inlineVal = head.text.slice(colonIdx + 1).trim();

  if (inlineVal !== "") {
    // Single-line scalar / inline array / inline object.
    out[key] = parseInlineValue(inlineVal, head.lineNo);
    return 1;
  }

  // Block follow-up: look at next lines with indent > 0.
  // Could be nested object (subkeys) or block-style array (`- ...`).
  let j = startIdx + 1;
  // Skip already-filtered blanks (filter already removed them)
  if (j >= lines.length || indentOf(lines[j].text) === 0) {
    // Empty value, no follow-up — treat as null.
    out[key] = null;
    return 1;
  }

  const firstChildIndent = indentOf(lines[j].text);
  const firstChildText = lines[j].text.slice(firstChildIndent);
  const isArray = firstChildText.startsWith("- ");

  if (isArray) {
    const arr = [];
    while (j < lines.length && indentOf(lines[j].text) === firstChildIndent) {
      const childText = lines[j].text.slice(firstChildIndent);
      if (!childText.startsWith("- ")) break;
      const itemRaw = childText.slice(2).trim();
      arr.push(parseInlineValue(itemRaw, lines[j].lineNo));
      j++;
    }
    out[key] = arr;
    return j - startIdx;
  }

  // Nested object (one level): consume same-indent `subkey: scalar` lines.
  const obj = {};
  while (j < lines.length && indentOf(lines[j].text) === firstChildIndent) {
    const childText = lines[j].text.slice(firstChildIndent);
    const cIdx = findTopLevelColon(childText);
    if (cIdx === -1) {
      throw new Error(
        "Line " +
          lines[j].lineNo +
          ": expected `subkey: value` in nested object under '" +
          key +
          "', got: " +
          childText,
      );
    }
    const subKey = childText.slice(0, cIdx).trim();
    const subVal = childText.slice(cIdx + 1).trim();
    if (subVal === "") {
      throw new Error(
        "Line " +
          lines[j].lineNo +
          ": nested values must be scalars in this subset (no deeper nesting). Key: '" +
          key +
          "." +
          subKey +
          "'.",
      );
    }
    obj[subKey] = parseInlineValue(subVal, lines[j].lineNo);
    j++;
  }
  out[key] = obj;
  return j - startIdx;
}

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────

function parse(source) {
  const split = splitFrontmatter(source);
  const data = parseFrontmatter(split.frontmatter, split.frontmatterLineOffset);
  return { data, body: split.body };
}

module.exports = {
  parse,
  // Exposed for tests
  splitFrontmatter,
  parseFrontmatter,
  parseInlineValue,
  parseInlineArray,
  parseInlineObject,
  splitTopLevel,
  coerceScalar,
};
