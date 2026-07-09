import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assertGuardSafe } from "../../src/markdown-engine/milkdownPreset";
import { splitRawFrontmatter } from "../../src/markdown-engine/rawFrontmatter";

const require = createRequire(import.meta.url);
const domains = require("../../../domains.json") as {
  domains: Record<string, { wysiwyg?: { safePaths?: string[] } }>;
};
const {
  deriveEquivalenceView,
  listSafePaths,
} = require("../../../scripts/lib/wysiwyg-registry.js");
const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

// Single source of truth shared with the baseline runner — don't re-inline the
// flatMap (the editor gate mirrors it inline only to avoid bundling this CJS module).
const SAFE_PATHS: string[] = listSafePaths(domains);

// Per-file dist-equivalence is asserted only for domains that declare a
// `wysiwyg.distEquivalence` in domains.json. The engine dispatch lives in
// scripts/lib/wysiwyg-registry.js (deriveEquivalenceView):
//   foundations/accessibility -> "section-dist"       (Pattern-H file tree)
//   guidelines (components)    -> "guideline-sections" (per-component sections[];
//                                  ignores the rendered-equivalent markdown field)
// Content domains declare no distEquivalence; their dist-safety is instead
// proven holistically by CI derive-and-diff gates:
//   content/global  -> content-derive.yml  (regenerates content/dist/global.md)
//   content/patterns -> guidelines-derive.yml (triggers on content/src/patterns/*.md,
//                        auto-commits components/dist/guidelines/*)
// If those CI gates were removed, content would lose its dist safety net.

// A component removed by a breaking Figma sync can leave a stale safePaths
// entry in domains.json (its content.md no longer exists). Existence is
// enforced by the manifest-validation gate, not here; this round-trip test
// only covers files that exist, so skip missing ones rather than ENOENT the
// whole editor suite.
for (const rel of SAFE_PATHS.filter((p) => existsSync(path.join(REPO, p)))) {
  test(`WYSIWYG dist-safe: ${rel}`, async () => {
    const text = readFileSync(path.join(REPO, rel), "utf8");
    const { body } = splitRawFrontmatter(text);
    // assertGuardSafe (milkdownPreset.ts) is the single source of truth for
    // "guard-safe": idempotent round-trip, no Kramdown block IAL, and no
    // inline HTML except <br> and the <Media> directive (code spans / fenced
    // blocks are literal text, not HTML, and are stripped before that scan).
    // Shared with rich-toolbar-commands.test.ts so the two guards can never
    // drift apart. Throws with a message naming which check failed; returns
    // rt1 for the dist-equivalence check below.
    const rt1 = await assertGuardSafe(body);
    const want = deriveEquivalenceView(domains, rel, body);
    if (want !== null) {
      assert.deepEqual(
        deriveEquivalenceView(domains, rel, rt1),
        want,
        "structured dist view must be unchanged by the round-trip",
      );
    }
  });
}
