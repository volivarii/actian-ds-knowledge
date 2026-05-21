"use strict";

// Markdown → structured sections parser for per-component guideline domain
// files (components/src/<slug>/{content,usage,design,behavior}.md).
//
// Phase 1 of the per-component multi-domain guideline architecture.
//
// Each domain file is plain markdown with an OPTIONAL YAML frontmatter block.
// The body is parsed into a flat `sections[]` list keyed by `## ` headings,
// with one reserved level of `### ` nesting (`subsections[]`). Within a
// section, content items appear in AUTHORED SOURCE ORDER and are projected
// into the small set of shapes the downstream consumers handle (plugin
// brief-sourcing.js + docs generate-component-pages.cjs renderContentItems):
//
//   - { prose }                         ← standalone paragraphs (plain prose)
//   - { bullets: [...] }                ← one markdown list (preserved as a
//                                         unit so adjacent lists separated
//                                         by prose stay distinguishable)
//   - { do, dont }                      ← "Do / Don't" tables (vocab also
//                                         covers Use|Avoid, Recommended|Avoid)
//   - { term, rule }                    ← terminology tables (Term | Usage)
//   - { note }                          ← blockquotes ONLY (opt-in callouts)
//   - { example }                       ← fenced code blocks
//   - { table: { headers, rows } }      ← any other table
//
// Key design choices:
//   • Bare paragraphs become {prose}, NOT {note}. A {note} (Callout in the
//     docs site) is only emitted from a markdown blockquote — the author opts
//     in explicitly via `>`. Universal precedent across Primer, Polaris,
//     Carbon, Starlight, Markdoc.
//   • Lists are preserved as {bullets:[...]} units, not splayed into the
//     bucket as strings. This preserves the source-order distinction between
//     "one list" and "list, prose, another list."
//   • A bare string in content[] is the LEGACY shape (pre-prose/bullets JSON)
//     and is still accepted by the schema for backwards compatibility; the
//     parser no longer emits it.
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
  return cleanCell(s)
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

// ───────────────────────────────────────────────────────────────────────────
// Table shape detection
// ───────────────────────────────────────────────────────────────────────────

// DO/DONT vocab covers the synonyms authors actually use in content.md across
// the kit: plain "Do | Don't" (~17 files), "Use | Avoid" (table), and
// "Recommended labels | Avoid" (sticky-footer). normHeader strips to lowercase
// letters only, so multi-word headers collapse (e.g. "Recommended labels" →
// "recommendedlabels"). "use" is intentionally a DO synonym — it shadows the
// older RULE_HEADERS slot, which is fine because the do-dont check runs first
// in classifyTable() and a "Use | Avoid" table is always do-dont, never
// terminology.
const DO_HEADERS = new Set([
  "do",
  "dos",
  "use",
  "recommended",
  "recommendedlabels",
  "good",
]);
const DONT_HEADERS = new Set([
  "dont",
  "donts",
  "donot",
  "avoid",
  "notrecommended",
  "bad",
]);
const TERM_HEADERS = new Set(["term", "termortermpair", "termpair", "terms"]);
const RULE_HEADERS = new Set(["usage", "rule", "definition", "guidance"]);

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
      .map((r) => ({
        term: r[0],
        rule: r.slice(1).filter(Boolean).join(" — "),
      }));
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
// Items are appended in authored source order; the downstream renderers
// preserve that order and only merge CONSECUTIVE same-type runs (e.g. several
// do/dont pairs from one table) into compound components.
function projectToken(token, bucket) {
  switch (token.type) {
    case "list": {
      // Preserve the list as a single unit so two `<ul>`s separated by prose
      // remain distinguishable downstream. Splaying items into the bucket as
      // bare strings (the legacy behavior) loses that boundary.
      const items = (token.items || [])
        .map((item) => cleanCell(item.text))
        .filter(Boolean);
      if (items.length) bucket.push({ bullets: items });
      return;
    }
    case "table": {
      projectTable(token).forEach((it) => bucket.push(it));
      return;
    }
    case "blockquote": {
      // Blockquotes are the author's opt-in for a Callout. Only they become
      // {note} — bare paragraphs become {prose}.
      const note = cleanCell(token.text);
      if (note) bucket.push({ note });
      return;
    }
    case "paragraph": {
      const text = cleanCell(token.text);
      if (text) bucket.push({ prose: text });
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
