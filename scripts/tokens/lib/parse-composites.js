// scripts/tokens/lib/parse-composites.js
"use strict";
// Parses composite style rows from tokens.md:
//   - parseBorderStyles(md) → [{name, width, color, status}]  — §2.3 Style table
//   - parseFocusStyles(md)  → [{name, width, color, status}]  — §2.5 (composite rows only)
//   - parseShadows(md)      → [{name, value, status}]          — §2.6 Elevation

function statusFrom(cell) {
  if (cell.includes("In Review")) return "In Review";
  if (cell.includes("Proposed")) return "Proposed";
  return "Shipped";
}

/**
 * Parse a table row whose value cell contains "<width> solid --zen-color-<ref>".
 * Returns {name, width, color, status} or null if the row doesn't match.
 * tokenPrefix is e.g. "zen-border-" or "zen-focus-ring-".
 */
function parseCompositeLine(line, tokenPrefix) {
  if (!line.includes(" solid ")) return null;
  if (line.indexOf("`--zen-") === -1) return null;

  const cells = line.split("|").map((c) => c.trim());

  // Token cell: `--zen-border-default` or `--zen-focus-ring-primary`
  const tokCell = cells.find((c) => /`--zen-[a-z0-9-]+`/.test(c));
  if (!tokCell) return null;
  const tokM = tokCell.match(/`--zen-([a-z0-9-]+)`/);
  if (!tokM) return null;
  const fullName = tokM[1]; // e.g. "border-default" or "focus-ring-primary"

  // Strip prefix → leaf name
  if (!fullName.startsWith(tokenPrefix)) return null;
  const name = fullName.slice(tokenPrefix.length); // e.g. "default" or "primary"

  // Value cell: `1px solid --zen-color-neutral-100`
  const ti = cells.indexOf(tokCell);
  const valueCell = cells[ti + 1] || "";
  const valRaw = valueCell.replace(/`/g, "").trim();
  // Match: <width> solid --zen-color-<role>-<shade>  OR  --zen-color-<singleton>
  const m = valRaw.match(/^(\d+px)\s+solid\s+--zen-color-(.+)$/);
  if (!m) return null;
  const width = m[1];
  const colorRef = m[2]; // e.g. "neutral-100" or "white"

  // Strip any trailing spaces from color ref
  const color = colorRef.trim();

  // Status from the last non-empty cell
  const statusCell = cells.filter((c) => c.length > 0).pop() || "";
  return { name, width, color, status: statusFrom(statusCell) };
}

/**
 * Parses §2.3 "Style (Composite)" table rows.
 * Only rows with "zen-border-" token prefix AND " solid " in the value.
 */
function parseBorderStyles(markdown) {
  const out = [];
  for (const line of String(markdown).split(/\r?\n/)) {
    const row = parseCompositeLine(line, "border-");
    if (row) out.push(row);
  }
  return out;
}

/**
 * Parses §2.5 Focus Rings composite rows (only rows that contain " solid ").
 * Skips focus-ring-offset which is a plain dimension.
 */
function parseFocusStyles(markdown) {
  const out = [];
  for (const line of String(markdown).split(/\r?\n/)) {
    const row = parseCompositeLine(line, "focus-ring-");
    if (row) out.push(row);
  }
  return out;
}

/**
 * Parses §2.6 Elevation shadow rows.
 * Token pattern: --zen-shadow-<name>  Value = raw shadow string (verbatim).
 * Shadow rows have comma-separated multi-value entries.
 */
function parseShadows(markdown) {
  const out = [];
  for (const line of String(markdown).split(/\r?\n/)) {
    if (line.indexOf("`--zen-shadow-") === -1) continue;

    const cells = line.split("|").map((c) => c.trim());
    const tokCell = cells.find((c) => /`--zen-shadow-[a-z0-9-]+`/.test(c));
    if (!tokCell) continue;
    const tokM = tokCell.match(/`--zen-shadow-([a-z0-9-]+)`/);
    if (!tokM) continue;
    const name = tokM[1]; // e.g. "xs"

    const ti = cells.indexOf(tokCell);
    const valueCell = cells[ti + 1] || "";
    // Value cell: ` 0px 1px 3px 1px #0F, 0px 1px 5px 0px #12 ` (with backticks stripped)
    const value = valueCell.replace(/`/g, "").trim();
    if (!value) continue;

    const statusCell = cells.filter((c) => c.length > 0).pop() || "";
    out.push({ name, value, status: statusFrom(statusCell) });
  }
  return out;
}

module.exports = { parseBorderStyles, parseFocusStyles, parseShadows };
