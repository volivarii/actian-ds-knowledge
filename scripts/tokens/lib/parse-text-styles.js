// scripts/tokens/lib/parse-text-styles.js
"use strict";
// Parses tokens.md §2.2 "Text Style Tokens (Composite)" table into named style
// specs, and builds DTCG typography composite leaves from those specs.

function statusFrom(cell) {
  if (cell.includes("In Review")) return "In Review";
  if (cell.includes("Proposed")) return "Proposed";
  return "Shipped";
}

/**
 * Maps a raw letterspacing cell value to a path segment used in references.
 *   "letterspacing-normal"   → "normal"
 *   "letterspacing-wide-1"   → "wide-1"   (kept as-is; reference builder splits further)
 *
 * Returns the segment after the leading "letterspacing-" prefix.
 * Throws if the cell doesn't match the expected format.
 */
function parseLetterspacingCell(cell) {
  const m = cell.trim().match(/^letterspacing-(.+)$/);
  if (!m)
    throw new Error(
      `[parse-text-styles] unrecognised letterspacing cell: "${cell}"`,
    );
  return m[1]; // e.g. "normal", "wide-1", "wide-2"
}

/**
 * Converts a letterspacing segment into a DTCG reference path segment.
 *   "normal"  → "font.letterspacing.normal"
 *   "wide-1"  → "font.letterspacing.wide.1"
 *   "wide-2"  → "font.letterspacing.wide.2"
 */
function letterspacingRef(segment) {
  if (segment === "normal") return "font.letterspacing.normal";
  // wide-N: split on the last hyphen-digit
  const m = segment.match(/^wide-(\d+)$/);
  if (m) return `font.letterspacing.wide.${m[1]}`;
  throw new Error(
    `[parse-text-styles] unrecognised letterspacing segment: "${segment}"`,
  );
}

/**
 * Parses the §2.2 composite table in tokens.md.
 * Columns: Token | Weight | Size | Letter Spacing | Line Height | Usage | Status
 *
 * Returns Array<{ name, weight, size, letterspacing, lineheight, status }>
 *   where `name` is the token suffix after `--zen-text-` (e.g. "heading-display").
 *   `letterspacing` is the resolved segment (e.g. "normal", "wide-1").
 */
function parseTextStyles(markdown) {
  const out = [];
  for (const line of String(markdown).split(/\r?\n/)) {
    if (line.indexOf("`--zen-text-") === -1) continue;
    const cells = line.split("|").map((c) => c.trim());
    const tokCell = cells.find((c) => /`--zen-text-[a-z0-9-]+`/.test(c));
    if (!tokCell) continue;
    const tokM = tokCell.match(/`--zen-text-([a-z0-9-]+)`/);
    if (!tokM) continue;
    const name = tokM[1];

    // Locate the token cell index and extract subsequent columns.
    const ti = cells.indexOf(tokCell);
    const weight = (cells[ti + 1] || "").trim();
    const size = (cells[ti + 2] || "").trim();
    const lsRaw = (cells[ti + 3] || "").trim();
    const lineheight = (cells[ti + 4] || "").trim();
    const statusCell = cells[cells.length - 1] || cells[cells.length - 2] || "";

    if (!weight || !size || !lsRaw || !lineheight) continue; // incomplete row

    const letterspacing = parseLetterspacingCell(lsRaw);
    out.push({
      name,
      weight,
      size,
      letterspacing,
      lineheight,
      status: statusFrom(statusCell),
    });
  }
  return out;
}

/**
 * Builds a DTCG `typography` composite leaf from a parsed style spec.
 *
 * @param {{ name, weight, size, letterspacing, lineheight, status }} spec
 * @returns {{ $type: "typography", $value: object, $extensions: object }}
 */
function buildTextStyle(spec) {
  const lsPath = letterspacingRef(spec.letterspacing);
  return {
    $type: "typography",
    $value: {
      fontWeight: `{font.weight.${spec.weight}}`,
      fontSize: `{font.size.${spec.size}}`,
      letterSpacing: `{${lsPath}}`,
      lineHeight: `{font.lineheight.${spec.lineheight}}`,
    },
    $extensions: { "com.actian.status": spec.status },
  };
}

module.exports = { parseTextStyles, buildTextStyle };
