import "../tests/setup-happy-dom";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { roundTripMarkdown } from "../src/markdown-engine/milkdownPreset";
import { splitRawFrontmatter, joinRawFrontmatter } from "../src/markdown-engine/rawFrontmatter";

const require = createRequire(import.meta.url);
const domains = require("../../domains.json") as {
  domains: Record<string, { wysiwyg?: { safePaths?: string[] } }>;
};
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const safePaths = Object.values(domains.domains).flatMap(
  (d) => d.wysiwyg?.safePaths ?? [],
);
for (const rel of safePaths) {
  const abs = path.join(REPO, rel);
  const text = readFileSync(abs, "utf8");
  const { frontmatterBlock, body } = splitRawFrontmatter(text);
  const next = joinRawFrontmatter(frontmatterBlock, await roundTripMarkdown(body));
  if (next !== text) { writeFileSync(abs, next); console.log("normalized", rel); }
  else console.log("unchanged ", rel);
}
