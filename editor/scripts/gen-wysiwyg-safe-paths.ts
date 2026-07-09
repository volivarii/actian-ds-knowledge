// Generates editor/src/generated/wysiwyg-safe-paths.json: the CI-derived set of
// source files whose Milkdown body round-trip is proven rich-safe. Replaces the
// old hand-curated domains.json `wysiwyg.safePaths` allowlist (whose guard test
// existsSync-skipped missing entries, so it silently passed over files it never
// checked). Here we walk EVERY editable file (no skips) and actually round-trip
// each one through the shared guard.
//
// The classifier (isRichSafe) and the walk-and-classify loop (classifyAll) live
// in ./richSafe.ts, shared verbatim with the corpus gate
// (tests/markdown-engine/wysiwyg-safe-paths.test.ts), which re-runs the same
// classification and asserts the committed JSON equals it, so a stale commit
// or a generator/gate divergence fails CI loudly.
//
// Run: npm run gen:safe-paths  (from editor/)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO, editableSourceFiles, classifyAll } from "./richSafe";

const OUT = path.resolve(
  REPO,
  "editor",
  "src",
  "generated",
  "wysiwyg-safe-paths.json",
);

async function main(): Promise<void> {
  const walked = editableSourceFiles();
  const paths = await classifyAll();

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
