// Generates editor/src/generated/wysiwyg-safe-paths.json: the CI-derived set of
// source files whose Milkdown body round-trip is proven rich-safe. Replaces the
// old hand-curated domains.json `wysiwyg.safePaths` allowlist (whose guard test
// existsSync-skipped missing entries, so it silently passed over files it never
// checked). Here we walk EVERY editable file (no skips) and actually round-trip
// each one through the shared guard.
//
// Rich-safe predicate (Milkdown DOM required, so happy-dom must load first):
//   1. assertGuardSafe(body) does not throw: round-trip is idempotent (RT2===RT1),
//      no Kramdown block IAL, no inline HTML except <br> and <Media>.
//   2. When the file's domain declares a per-file distEquivalence, the structured
//      dist view is unchanged across the round-trip (body vs the returned rt1).
// The corpus gate (tests/markdown-engine/wysiwyg-safe-paths.test.ts) re-runs this
// same classification and asserts the committed JSON equals it, so a stale commit
// or a generator/gate divergence fails CI loudly.
//
// Run: npm run gen:safe-paths  (from editor/)
import "../tests/setup-happy-dom";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import path from "node:path";
import { assertGuardSafe } from "../src/markdown-engine/milkdownPreset";
import { splitRawFrontmatter } from "../src/markdown-engine/rawFrontmatter";

const require = createRequire(import.meta.url);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SCRIPT_DIR, "..", "..");
const OUT = path.resolve(
  SCRIPT_DIR,
  "..",
  "src",
  "generated",
  "wysiwyg-safe-paths.json",
);

const domains = require("../../domains.json");
const { deriveEquivalenceView, distEquivalenceForPath, editableSourceFiles } =
  require("../../scripts/lib/wysiwyg-registry.js") as {
    deriveEquivalenceView: (d: unknown, rel: string, body: string) => unknown;
    distEquivalenceForPath: (d: unknown, rel: string) => unknown | null;
    editableSourceFiles: (repoRoot: string) => string[];
  };

// The single rich-safe classifier, shared verbatim with the corpus gate. Keep the
// two in lockstep: the gate asserts committed === fresh, so any divergence fails.
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

async function main(): Promise<void> {
  const walked = editableSourceFiles(REPO);
  const paths: string[] = [];
  for (const rel of walked) {
    if (await isRichSafe(rel)) paths.push(rel);
  }
  paths.sort();

  const output = {
    _meta: {
      auto_generated: true,
      source: "editor/scripts/gen-wysiwyg-safe-paths.ts",
      do_not_edit: true,
    },
    paths,
  };
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(output, null, 2) + "\n");
  console.log(
    `wysiwyg-safe-paths: ${paths.length} rich-safe / ${walked.length} walked → ${path.relative(REPO, OUT)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
