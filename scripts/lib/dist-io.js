"use strict";

// Shared dist-IO primitives — the single source of truth for how the derive
// pipeline serializes + writes JSON (previously copy-pasted ~6× across the
// per-domain derives, a byte-drift hazard).
//
// `stableStringify` is PURE (no fs). `writeAtomic` lazy-requires fs/path inside
// the function so this module stays import-safe for pure consumers — e.g.
// app-context/lib-pure.js and lib/graph/model.js (used by editor node tests and
// graph modelling) import only stableStringify and must NOT pull fs into their
// dependency graph at module-eval time.

// Canonical JSON serialization for every dist file: 2-space indent + trailing
// newline. The trailing "\n" is load-bearing for byte-identical dist + clean
// diffs; do not change it.
function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

// Write `contents` to `absPath`, creating parent dirs as needed.
function writeAtomic(absPath, contents) {
  const fs = require("fs");
  const path = require("path");
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, contents);
}

module.exports = { stableStringify, writeAtomic };
