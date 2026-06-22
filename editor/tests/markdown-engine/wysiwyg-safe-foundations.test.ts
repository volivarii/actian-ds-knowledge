import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { roundTripMarkdown } from "../../src/markdown-engine/milkdownPreset";
import { splitRawFrontmatter } from "../../src/markdown-engine/rawFrontmatter";
import { FOUNDATIONS_WYSIWYG_SAFE } from "../../src/lib/wysiwygPaths";

const require = createRequire(import.meta.url);
const { deriveFromMarkdown } = require("../../../scripts/lib/section-dist/index.js");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Mirror the foundations derive's call (scripts/foundations/derive-foundations.js).
function deriveFiles(body: string): unknown {
  return deriveFromMarkdown(body, {
    skipH2Slugs: { "handoff-protocol": true, "related-guidelines": true },
    sourceRel: "foundations/src/",
    logger: { warn: () => {} },
  }).files;
}

for (const rel of FOUNDATIONS_WYSIWYG_SAFE) {
  test(`WYSIWYG dist-safe: ${rel}`, async () => {
    const text = readFileSync(path.join(REPO, rel), "utf8");
    const { body } = splitRawFrontmatter(text);
    const rt1 = await roundTripMarkdown(body);
    const rt2 = await roundTripMarkdown(rt1);
    // (1) idempotent -- repeated saves are no-ops
    assert.equal(rt2, rt1, "round-trip must be idempotent (RT2 === RT1)");
    // (2) fail-closed gates
    assert.ok(!/\{:/.test(rt1), "no Kramdown IAL in round-tripped body");
    assert.equal(rt1.match(/<(?!br\b\/?>)[A-Za-z]/g), null, "no inline HTML except <br>");
    // (3) dist-equivalent -- round-trip must not change the parsed dist
    assert.deepEqual(deriveFiles(rt1), deriveFiles(body), "section-dist must be unchanged by the round-trip");
  });
}
