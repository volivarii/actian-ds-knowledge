"use strict";
// Parses tokens.md "Resolves To"/"Suggested Value" tables for the color groups
// text / bg / icon. Each row maps --zen-color-<group>-<leaf> to another --zen-color-* ref.

const GROUPS = new Set(["text", "bg", "icon"]);

// Sub-groups that nest one level (matches the frozen tokens.json structure).
// Only text.link is nested; everything else (placeholder-subtle, etc.) is a flat key.
const NESTED_SUBGROUPS = { text: new Set(["link"]) };

function dottedLeafName(group, raw) {
  const i = raw.indexOf("-");
  if (i > 0) {
    const head = raw.slice(0, i);
    if (NESTED_SUBGROUPS[group] && NESTED_SUBGROUPS[group].has(head)) {
      return head + "." + raw.slice(i + 1); // link-default -> link.default
    }
  }
  return raw; // flat, hyphens preserved: placeholder-subtle, secondary
}

function statusFrom(cell) {
  if (cell.includes("In Review")) return "In Review";
  if (cell.includes("Proposed")) return "Proposed";
  return "Shipped"; // 🟢 Shipped (default)
}

function parseSemantics(markdown) {
  const out = [];
  for (const line of String(markdown).split(/\r?\n/)) {
    if (line.indexOf("`--zen-color-") === -1) continue;
    const cells = line.split("|").map((c) => c.trim());
    // token cell = first cell containing a --zen-color- backtick token
    const tokCell = cells.find((c) => /`--zen-color-[a-z-]+`/.test(c));
    if (!tokCell) continue;
    const nameM = tokCell.match(/`--zen-color-([a-z]+)-([a-z0-9-]+)`/);
    if (!nameM || !GROUPS.has(nameM[1])) continue;
    const group = nameM[1];
    const name = dottedLeafName(group, nameM[2]);
    // resolves-to = the OTHER --zen-color-* ref in the row
    const refs = [...line.matchAll(/`--zen-color-([a-z0-9-]+)`/g)].map(
      (m) => m[1],
    );
    const resolvesTo = refs.find((r) => r !== `${group}-${nameM[2]}`);
    if (!resolvesTo) continue; // value rows without a ref (handled in P3) are skipped here
    const opacityM = line.match(/(\d{1,3})%\s*opacity/);
    const opacity = opacityM ? Number(opacityM[1]) / 100 : null;
    const statusCell = cells[cells.length - 1] || cells[cells.length - 2] || "";
    out.push({
      group,
      name,
      resolvesTo,
      opacity,
      status: statusFrom(statusCell),
    });
  }
  return out;
}

module.exports = { parseSemantics };
