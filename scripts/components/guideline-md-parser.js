"use strict";

// Markdown → structured sections parser for per-component guideline domain
// files (components/src/<slug>/{content,usage,design,behavior}.md).
//
// Phase 1 of the per-component multi-domain guideline architecture.
//
// Each domain file is plain markdown with an OPTIONAL YAML frontmatter block.
// The body is parsed into a flat `sections[]` list keyed by `## ` headings,
// with one reserved level of `### ` nesting (`subsections[]`). Within a
// section, content items are projected into the small set of shapes the
// downstream consumers already bucket (plugin brief-sourcing.js + docs
// generate-component-pages.cjs renderContentSection):
//
//   - plain string                      ← bullet-list items
//   - { do, dont }                      ← "Do / Don't" tables
//   - { term, rule }                    ← terminology tables (Term | Usage)
//   - { note }                          ← blockquotes + standalone paragraphs
//   - { table: { headers, rows } }      ← any other table
//
// The verbatim markdown body is retained separately by the deriver, so this
// structured projection does NOT need to be loss-free — it is the queryable
// view, the markdown is the prose view.

const { marked } = require("marked");

// ───────────────────────────────────────────────────────────────────────────
// Frontmatter (tolerant — domain files MAY omit it)
// ───────────────────────────────────────────────────────────────────────────

const FENCE = /^---\s*$/;

// Returns { frontmatter: string|null, body: string }. Unlike the strict
// categories parser, a missing opening fence is NOT an error here — domain
// files are allowed to be frontmatter-free.
function splitOptionalFrontmatter(source) {
  const lines = source.split(/\r?\n/);
  if (lines.length === 0 || !FENCE.test(lines[0])) {
    return { frontmatter: null, body: source };
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
      "Opening `---` fence with no closing `---`. Either close the " +
        "frontmatter block or remove the opening fence.",
    );
  }
  return {
    frontmatter: lines.slice(1, endIdx).join("\n"),
    body: lines
      .slice(endIdx + 1)
      .join("\n")
      .replace(/^\n+/, ""),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Cleaners
// ───────────────────────────────────────────────────────────────────────────

// Strip Jekyll `{: .class}` attribute lines/spans the legacy content MDs use.
function stripJekyllAttrs(s) {
  return s.replace(/\{:\s*[^}]*\}/g, "").trim();
}

function cleanCell(s) {
  return stripJekyllAttrs(String(s == null ? "" : s))
    .replace(/\s+/g, " ")
    .trim();
}

function normHeader(s) {
  return cleanCell(s).toLowerCase().replace(/[^a-z]/g, "");
}

// ───────────────────────────────────────────────────────────────────────────
// Table shape detection
// ───────────────────────────────────────────────────────────────────────────

const DO_HEADERS = new Set(["do", "dos"]);
const DONT_HEADERS = new Set(["dont", "donts", "donot"]);
const TERM_HEADERS = new Set(["term", "termortermpair", "termpair", "terms"]);
const RULE_HEADERS = new Set(["usage", "rule", "definition", "guidance", "use"]);

function tableHeaders(token) {
  // marked v14: token.header is an array of { text } cells.
  return (token.header || []).map((c) => normHeader(c.text));
}

function classifyTable(token) {
  const h = tableHeaders(token);
  if (h.length === 2 && DO_HEADERS.has(h[0]) && DONT_HEADERS.has(h[1])) {
    return "do-dont";
  }
  if (h.length >= 2 && TERM_HEADERS.has(h[0]) && RULE_HEADERS.has(h[1])) {
    return "terminology";
  }
  return "generic";
}

function tableRows(token) {
  // marked v14: token.rows is an array of arrays of { text } cells.
  return (token.rows || []).map((row) => row.map((c) => cleanCell(c.text)));
}

function projectTable(token) {
  const kind = classifyTable(token);
  const rows = tableRows(token);
  if (kind === "do-dont") {
    return rows
      .filter((r) => r[0] || r[1])
      .map((r) => ({ do: r[0], dont: r[1] }));
  }
  if (kind === "terminology") {
    return rows
      .filter((r) => r[0])
      .map((r) => ({ term: r[0], rule: r.slice(1).filter(Boolean).join(" — ") }));
  }
  return [
    {
      table: {
        headers: (token.header || []).map((c) => cleanCell(c.text)),
        rows: rows,
      },
    },
  ];
}

// ───────────────────────────────────────────────────────────────────────────
// Token → content-item projection
// ───────────────────────────────────────────────────────────────────────────

// Push the content items produced by a single block token into `bucket`.
function projectToken(token, bucket) {
  switch (token.type) {
    case "list": {
      (token.items || []).forEach((item) => {
        const text = cleanCell(item.text);
        if (text) bucket.push(text);
      });
      return;
    }
    case "table": {
      projectTable(token).forEach((it) => bucket.push(it));
      return;
    }
    case "blockquote": {
      const note = cleanCell(token.text);
      if (note) bucket.push({ note });
      return;
    }
    case "paragraph": {
      const note = cleanCell(token.text);
      if (note) bucket.push({ note });
      return;
    }
    case "code": {
      if (token.text && token.text.trim()) {
        bucket.push({ example: token.text.trim() });
      }
      return;
    }
    // space / hr / html → ignored
    default:
      return;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Body → sections[]
// ───────────────────────────────────────────────────────────────────────────

// Parse a markdown body into a flat sections list. H1 is treated as the
// document title and ignored here (the deriver sources the title from
// _meta.yml / registry). H2 opens a section; H3 opens a subsection within
// the current section; H4+ are flattened into the nearest section's content
// as notes (one reserved nesting level only — see the architecture spec).
function parseSections(body) {
  const tokens = marked.lexer(body || "");
  const sections = [];
  let current = null; // active H2 section
  let currentSub = null; // active H3 subsection

  function ensureSection(heading) {
    current = { heading: heading, content: [] };
    currentSub = null;
    sections.push(current);
  }

  function targetBucket() {
    if (currentSub) return currentSub.content;
    if (current) return current.content;
    // Content before any H2 — synthesize an untitled lead section.
    ensureSection("");
    return current.content;
  }

  tokens.forEach((token) => {
    if (token.type === "heading") {
      const text = cleanCell(token.text);
      if (token.depth === 1) {
        return; // document title — ignored
      }
      if (token.depth === 2) {
        ensureSection(text);
        return;
      }
      if (token.depth === 3) {
        if (!current) ensureSection("");
        currentSub = { subheading: text, content: [] };
        if (!current.subsections) current.subsections = [];
        current.subsections.push(currentSub);
        return;
      }
      // H4+ — flatten as an emphasized note into the active bucket.
      targetBucket().push({ note: text });
      return;
    }
    projectToken(token, targetBucket());
  });

  // Drop a synthesized empty lead section if it ended up with nothing.
  return sections.filter(
    (s) =>
      s.heading ||
      s.content.length > 0 ||
      (s.subsections && s.subsections.length > 0),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────

// Parse a domain markdown file. Returns:
//   { frontmatter: object|null, markdown: string, sections: [...] }
// `markdown` is the verbatim body (frontmatter stripped) for prose consumers.
function parseGuidelineMarkdown(source) {
  const split = splitOptionalFrontmatter(source);
  const body = split.body.replace(/\r\n/g, "\n").trim();
  return {
    frontmatter: split.frontmatter,
    markdown: body,
    sections: parseSections(body),
  };
}

module.exports = {
  parseGuidelineMarkdown,
  // exposed for tests
  splitOptionalFrontmatter,
  parseSections,
  classifyTable,
  projectTable,
  stripJekyllAttrs,
};
