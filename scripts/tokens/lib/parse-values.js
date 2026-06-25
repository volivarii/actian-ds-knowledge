// scripts/tokens/lib/parse-values.js
"use strict";
// Parses tokens.md value tables (non-color numeric/string families) into
// px-normalized {token, value, status}. Color resolves-to rows and composite
// rows (border/focus styles, shadows) are skipped — those are handled elsewhere.

function statusFrom(cell) {
  if (cell.includes("In Review")) return "In Review";
  if (cell.includes("Proposed")) return "Proposed";
  return "Shipped";
}

function normalizeValue(cell) {
  // strip backticks for inspection
  const raw = cell.replace(/`/g, "").trim();
  // px-precedence: "(NNNpx)" first, then leading "NNNpx", then bare
  const paren = raw.match(/\((\d+(?:\.\d+)?)px\)/);
  if (paren) return paren[1] + "px";
  const lead = raw.match(/(^|\s|\/)\s*(\d+(?:\.\d+)?)px\b/);
  if (lead) return lead[2] + "px";
  // unit-less number (font-weight) or already-clean token (9999px handled above as bare px below)
  const barePx = raw.match(/^(\d+(?:\.\d+)?)px$/);
  if (barePx) return raw;
  const num = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (num) return raw;
  // family: drop surrounding quotes
  const fam = raw.match(/^"?([A-Za-z][A-Za-z0-9 ]*)"?$/);
  if (fam) return fam[1];
  return raw;
}

function parseValues(markdown) {
  const out = [];
  for (const line of String(markdown).split(/\r?\n/)) {
    if (line.indexOf("`--zen-") === -1) continue;
    if (line.indexOf("--zen-color-") !== -1) continue; // P2 color rows
    if (/ solid /.test(line)) continue;                 // composite style rows (Task 3/4)
    const cells = line.split("|").map((c) => c.trim());
    const tokCell = cells.find((c) => /`--zen-[a-z0-9-]+`/.test(c));
    if (!tokCell) continue;
    const tokM = tokCell.match(/`--zen-([a-z0-9-]+)`/);
    if (!tokM) continue;
    const token = tokM[1];
    // value cell = the cell after the token cell
    const ti = cells.indexOf(tokCell);
    const valueCell = cells[ti + 1] || "";
    if (valueCell.indexOf("--zen-") !== -1) continue; // resolves-to / composite reference
    const statusCell = cells[cells.length - 1] || cells[cells.length - 2] || "";
    out.push({ token, value: normalizeValue(valueCell), status: statusFrom(statusCell) });
  }
  return out;
}

module.exports = { parseValues };
