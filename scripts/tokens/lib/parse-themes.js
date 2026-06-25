"use strict";
// Parses the §2.1 Global Color table (role → Actian-base palette) and the
// Theme Palettes table (per-theme primary/neutral) from foundations/src/tokens.md.

// "--zen-color-success" + "--zen-color-green" → { success: "green" }
function parseGlobalRoles(md) {
  const roles = {};
  for (const line of String(md).split(/\r?\n/)) {
    const m = line.match(/`--zen-color-([a-z]+)`\s*\|\s*`--zen-color-([a-z-]+)`/);
    if (m) roles[m[1]] = m[2];
  }
  return roles;
}

// Rows of "| Actian | royal-blue | cool-grey | ... |" under the Theme Palettes table.
function parseThemes(md) {
  const themes = {};
  const known = new Set(["Actian", "Studio", "Explorer"]);
  for (const line of String(md).split(/\r?\n/)) {
    const cells = line.split("|").map((c) => c.trim());
    // cells[0] is "" (leading pipe); cells[1] = theme name
    if (cells.length >= 4 && known.has(cells[1]) && /^[a-z-]+$/.test(cells[2]) && /^[a-z-]+$/.test(cells[3])) {
      themes[cells[1].toLowerCase()] = { primary: cells[2], neutral: cells[3] };
    }
  }
  return themes;
}

module.exports = { parseGlobalRoles, parseThemes };
