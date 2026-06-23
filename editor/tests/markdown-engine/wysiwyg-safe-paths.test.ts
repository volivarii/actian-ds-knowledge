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
const { deriveFromMarkdown } = require("../../../scripts/lib/section-dist/index.js");
const { SKIP_H2_SLUGS } = require("../../../scripts/foundations/derive-foundations.js");
const domains = require("../../../domains.json") as {
  domains: Record<string, { wysiwyg?: { safePaths?: string[] } }>;
};
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const SAFE_PATHS: string[] = Object.values(domains.domains).flatMap(
  (d) => d.wysiwyg?.safePaths ?? [],
);

// Per-file dist-equivalence is asserted only for the section-dist domains.
// Content uses other engines; its dist-safety is proven holistically by the
// derive-no-op gate after the baseline (see plan Task 5 / verification).
function deriveFiles(body: string, rel: string): unknown | null {
  if (rel.startsWith("foundations/src/")) {
    return deriveFromMarkdown(body, {
      skipH2Slugs: SKIP_H2_SLUGS,
      sourceRel: "foundations/src/",
      logger: { warn: () => {} },
    }).files;
  }
  if (rel.startsWith("accessibility/src/")) {
    return deriveFromMarkdown(body, {
      sourceRel: "accessibility/src/",
      rootAnchor: "accessibility",
      logger: { warn: () => {} },
    }).files;
  }
  return null; // content -- no per-file dist-equivalence
}

for (const rel of SAFE_PATHS) {
  test(`WYSIWYG dist-safe: ${rel}`, async () => {
    const text = readFileSync(path.join(REPO, rel), "utf8");
    const { body } = splitRawFrontmatter(text);
    const rt1 = await roundTripMarkdown(body);
    const rt2 = await roundTripMarkdown(rt1);
    assert.equal(rt2, rt1, "round-trip must be idempotent (RT2 === RT1)");
    assert.ok(!/\{:/.test(rt1), "no Kramdown IAL in round-tripped body");
    assert.equal(rt1.match(/<(?!br\b\/?>)[A-Za-z]/g), null, "no inline HTML except <br>");
    const want = deriveFiles(body, rel);
    if (want !== null) {
      assert.deepEqual(deriveFiles(rt1, rel), want, "section-dist must be unchanged by the round-trip");
    }
  });
}
