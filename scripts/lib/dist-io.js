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

// Write `contents` to `absPath`, creating parent dirs as needed. Genuinely
// atomic: writes a pid-suffixed temp file in the same directory, then
// renameSync (atomic on POSIX same-filesystem), so a concurrent reader sees
// either the old or the new complete file — never a truncated one. This
// matters because `node --test tests/*.test.js` runs test files in parallel
// processes, and some tests re-derive committed dist files in place while
// other tests read them (e.g. graph derive() vs graph-coverage reading
// graph/dist/graph.json — a bare writeFileSync's truncate window flaked CI).
function writeAtomic(absPath, contents) {
  const fs = require("fs");
  const path = require("path");
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = absPath + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, absPath);
}

module.exports = { stableStringify, writeAtomic };
