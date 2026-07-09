import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assertGuardSafe } from "../../src/markdown-engine/milkdownPreset";
import { splitRawFrontmatter } from "../../src/markdown-engine/rawFrontmatter";
import committed from "../../src/generated/wysiwyg-safe-paths.json";

const require = createRequire(import.meta.url);
const domains = require("../../../domains.json");
const { deriveEquivalenceView, distEquivalenceForPath, editableSourceFiles } =
  require("../../../scripts/lib/wysiwyg-registry.js") as {
    deriveEquivalenceView: (d: unknown, rel: string, body: string) => unknown;
    distEquivalenceForPath: (d: unknown, rel: string) => unknown | null;
    editableSourceFiles: (repoRoot: string) => string[];
  };
const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

// The rich-safe classifier, kept in lockstep with the generator
// (editor/scripts/gen-wysiwyg-safe-paths.ts). assertGuardSafe (milkdownPreset.ts)
// is the single source of truth for guard-safety: idempotent round-trip, no
// Kramdown block IAL, no inline HTML except <br> and the <Media> directive (code
// spans / fenced blocks are stripped before that scan). It throws naming the
// failed check and returns rt1. On top of the guard, foundations/accessibility/
// guidelines additionally require their structured dist view to be UNCHANGED by
// the round-trip (distEquivalenceForPath resolves the engine by domain). Content
// declares no per-file distEquivalence; its dist-safety is proven holistically
// by CI derive-and-diff gates (content-derive.yml, guidelines-derive.yml).
async function isRichSafe(rel: string): Promise<boolean> {
  const { body } = splitRawFrontmatter(
    readFileSync(path.join(REPO, rel), "utf8"),
  );
  let rt1: string;
  try {
    rt1 = await assertGuardSafe(body);
  } catch {
    return false;
  }
  if (distEquivalenceForPath(domains, rel)) {
    try {
      assert.deepEqual(
        deriveEquivalenceView(domains, rel, rt1),
        deriveEquivalenceView(domains, rel, body),
      );
    } catch {
      return false;
    }
  }
  return true;
}

// Corpus gate: walk EVERY editable file (no existsSync skip of a curated list;
// that skip is exactly what let the old allowlist pass over renamed/missing
// files) and assert the committed generated set equals a fresh classification.
// Fails on drift (stale commit) OR on any generator/gate divergence.
test("committed rich-safe set equals a fresh classification (no drift, no skips)", async () => {
  const fresh: string[] = [];
  for (const rel of editableSourceFiles(REPO)) {
    if (await isRichSafe(rel)) fresh.push(rel);
  }
  assert.deepEqual(
    [...(committed as { paths: string[] }).paths].sort(),
    fresh.sort(),
    "run `npm run gen:safe-paths` and commit editor/src/generated/wysiwyg-safe-paths.json",
  );
});
