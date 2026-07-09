import "../tests/setup-happy-dom";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { roundTripMarkdown } from "../src/markdown-engine/milkdownPreset";
import {
  splitRawFrontmatter,
  joinRawFrontmatter,
} from "../src/markdown-engine/rawFrontmatter";
import safePathsJson from "../src/generated/wysiwyg-safe-paths.json";

// The rich-safe SET is the CI-derived set produced by
// scripts/gen-wysiwyg-safe-paths.ts (editor/src/generated/wysiwyg-safe-paths.json),
// no longer a domains.json allowlist. This runner normalizes each of those files
// on disk so a FIRST WYSIWYG save is a byte no-op (the round-trip may cosmetically
// normalize a body: `*` bullets, escapes, empty table cells rendered as an em-dash).
const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const safePaths: string[] = (safePathsJson as { paths: string[] }).paths;
for (const rel of safePaths) {
  try {
    const abs = path.join(REPO, rel);
    const text = readFileSync(abs, "utf8");
    const { frontmatterBlock, body } = splitRawFrontmatter(text);
    const next = joinRawFrontmatter(
      frontmatterBlock,
      await roundTripMarkdown(body),
    );
    if (next !== text) {
      writeFileSync(abs, next);
      console.log("normalized", rel);
    } else console.log("unchanged ", rel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`failed at ${rel}: ${msg}`);
    throw err;
  }
}
