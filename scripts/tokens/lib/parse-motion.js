// scripts/tokens/lib/parse-motion.js
"use strict";
// Parses §2.11 Motion section of tokens.md into three token arrays:
//   parseMotion(md) → { duration:[{name,value,status}], easing:[{name,value,status}], delay:[{name,value,status}] }
//
// SCOPING: Only rows containing a backtick-wrapped `--zen-motion-` token are
// parsed. The §2.11 "Component Motion Guide" sub-section references durations
// and easings by bare names (e.g. `duration-slow`, `ease-entrance`) — those
// rows have NO `--zen-motion-` prefix token and are intentionally excluded.

function statusFrom(cell) {
  if (cell.includes("In Review")) return "In Review";
  if (cell.includes("Proposed")) return "Proposed";
  return "Shipped";
}

/**
 * Parses §2.11 Motion token rows from tokens.md.
 *
 * Returns three arrays:
 *   duration — { name, value, status }  e.g. { name:"instant", value:"100ms", status:"Proposed" }
 *   easing   — { name, value, status }  e.g. { name:"entrance", value:"ease-out", status:"Proposed" }
 *   delay    — { name, value, status }  e.g. { name:"stagger", value:"20ms", status:"Proposed" }
 *
 * `name` = token suffix after the dimension prefix:
 *   --zen-motion-duration-<name>  →  name (e.g. "instant")
 *   --zen-motion-ease-<name>      →  name (e.g. "entrance")
 *   --zen-motion-delay-<name>     →  name (e.g. "stagger")
 */
function parseMotion(markdown) {
  const duration = [];
  const easing = [];
  const delay = [];

  for (const line of String(markdown).split(/\r?\n/)) {
    // Guard: only lines that reference a --zen-motion- CSS custom property
    if (!line.includes("--zen-motion-")) continue;

    const cells = line.split("|").map((c) => c.trim());

    // Find the token cell — must contain a backtick-wrapped --zen-motion- token
    const tokCell = cells.find((c) => /`--zen-motion-[a-z-]+`/.test(c));
    if (!tokCell) continue;

    const tokM = tokCell.match(/`--zen-motion-([a-z-]+)`/);
    if (!tokM) continue;
    const fullName = tokM[1]; // e.g. "duration-instant", "ease-entrance", "delay-stagger"

    // Value cell is the cell immediately after the token cell
    const ti = cells.indexOf(tokCell);
    const valueCell = cells[ti + 1] || "";
    const value = valueCell.replace(/`/g, "").trim();
    if (!value) continue;

    // Status from the last non-empty cell
    const statusCell = cells.filter((c) => c.length > 0).pop() || "";
    const status = statusFrom(statusCell);

    if (fullName.startsWith("duration-")) {
      duration.push({ name: fullName.slice("duration-".length), value, status });
    } else if (fullName.startsWith("ease-")) {
      easing.push({ name: fullName.slice("ease-".length), value, status });
    } else if (fullName.startsWith("delay-")) {
      delay.push({ name: fullName.slice("delay-".length), value, status });
    }
    // Unknown sub-family: skip gracefully
  }

  return { duration, easing, delay };
}

module.exports = { parseMotion };
