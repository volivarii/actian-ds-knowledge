import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { roundTripMarkdown } from "../../src/markdown-engine/milkdownPreset";
import { splitRawFrontmatter } from "../../src/markdown-engine/rawFrontmatter";

const require = createRequire(import.meta.url);
const {
  deriveFromMarkdown,
} = require("../../../scripts/lib/section-dist/index.js");
const {
  SKIP_H2_SLUGS,
} = require("../../../scripts/foundations/derive-foundations.js");
const domains = require("../../../domains.json") as {
  domains: Record<
    string,
    {
      wysiwyg?: {
        safePaths?: string[];
        distEquivalence?: {
          engine: string;
          sourceRel: string;
          rootAnchor?: string;
          applySkipH2Slugs?: boolean;
        };
      };
    }
  >;
};
const {
  distEquivalenceFor,
} = require("../../../scripts/lib/wysiwyg-registry.js");
const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const SAFE_PATHS: string[] = Object.values(domains.domains).flatMap(
  (d) => d.wysiwyg?.safePaths ?? [],
);

// Per-file dist-equivalence is asserted only for section-dist domains that
// declare a `wysiwyg.distEquivalence` in domains.json (currently foundations
// and accessibility). Content domains have no distEquivalence entry; their
// dist-safety is instead proven holistically by CI derive-and-diff gates:
//   content/global  -> content-derive.yml  (regenerates content/dist/global.md)
//   content/patterns -> guidelines-derive.yml (triggers on content/src/patterns/*.md,
//                        auto-commits components/dist/guidelines/*)
// If those CI gates were removed, content would lose its dist safety net.
function deriveFiles(body: string, rel: string): unknown | null {
  const cfg = distEquivalenceFor(domains, rel);
  if (cfg === null) return null;
  return deriveFromMarkdown(body, {
    sourceRel: cfg.sourceRel,
    ...(cfg.rootAnchor !== undefined ? { rootAnchor: cfg.rootAnchor } : {}),
    ...(cfg.applySkipH2Slugs ? { skipH2Slugs: SKIP_H2_SLUGS } : {}),
    logger: { warn: () => {} },
  }).files;
}

for (const rel of SAFE_PATHS) {
  test(`WYSIWYG dist-safe: ${rel}`, async () => {
    const text = readFileSync(path.join(REPO, rel), "utf8");
    const { body } = splitRawFrontmatter(text);
    const rt1 = await roundTripMarkdown(body);
    const rt2 = await roundTripMarkdown(rt1);
    assert.equal(rt2, rt1, "round-trip must be idempotent (RT2 === RT1)");
    assert.ok(!/\{:/.test(rt1), "no Kramdown IAL in round-tripped body");
    assert.equal(
      rt1.match(/<(?!br\b\/?>)[A-Za-z]/g),
      null,
      "no inline HTML except <br>",
    );
    const want = deriveFiles(body, rel);
    if (want !== null) {
      assert.deepEqual(
        deriveFiles(rt1, rel),
        want,
        "section-dist must be unchanged by the round-trip",
      );
    }
  });
}
