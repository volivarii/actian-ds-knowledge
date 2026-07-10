import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { editableSourceFiles, classifyAll } from "../../scripts/richSafe";
import committed from "../../src/generated/wysiwyg-safe-paths.json";

// The classifier (isRichSafe) and the walk-and-classify loop (classifyAll) are
// shared with the generator (editor/scripts/gen-wysiwyg-safe-paths.ts) via
// editor/scripts/richSafe.ts, so the two can never diverge from each other.
// assertGuardSafe (milkdownPreset.ts) is the single source of truth for
// guard-safety: idempotent round-trip, no Kramdown block IAL, no inline HTML
// except <br> and the <Media> directive (code spans / fenced blocks are
// stripped before that scan). On top of the guard, foundations/accessibility/
// guidelines additionally require their structured dist view to be UNCHANGED
// by the round-trip (distEquivalenceForPath resolves the engine by domain).
// Content declares no per-file distEquivalence; its dist-safety is proven
// holistically by CI derive-and-diff gates (content-derive.yml,
// guidelines-derive.yml).

// Fresh classification round-trips every walked file through Milkdown, which
// is not free; compute it once and share it across the tests in this file
// instead of re-walking the corpus per test.
let freshPromise: Promise<string[]> | null = null;
function fresh(): Promise<string[]> {
  if (!freshPromise) freshPromise = classifyAll();
  return freshPromise;
}

// Corpus gate: walk EVERY editable file (no existsSync skip of a curated list;
// that skip is exactly what let the old allowlist pass over renamed/missing
// files) and assert the committed generated set equals a fresh classification.
// Fails on drift (stale commit) OR on any generator/gate divergence.
test("committed rich-safe set equals a fresh classification (no drift, no skips)", async () => {
  assert.deepEqual(
    [...(committed as { paths: string[] }).paths].sort(),
    await fresh(),
    "run `npm run gen:safe-paths` and commit editor/src/generated/wysiwyg-safe-paths.json",
  );
});

// Files proven walked-but-UNSAFE (see task-3 report / gen-wysiwyg-safe-paths
// census). Pinned here because the corpus test above is self-referential: the
// generator wrote the committed JSON using this same classifier, so a future
// change that loosens the guard enough to let one of these through would have
// a regenerated commit and the corpus test BOTH pass green. This pin catches
// that direction independently.
const KNOWN_UNSAFE: { path: string; reason: string }[] = [
  {
    path: "components/src/avatar/content.md",
    reason:
      "a bare email address in a table cell round-trips to a GFM autolink " +
      "(<chris.frost@example.com>), which the disallowed-inline-HTML guard rejects",
  },
  {
    path: "components/src/search-dropdown-menu/content.md",
    reason:
      "the round-trip escapes the literal text `[query]` to `\\[query]`, " +
      "changing the derived guideline-sections dist view (real corruption, " +
      "not just a guard rejection)",
  },
  {
    path: "content/src/content-index.md",
    reason:
      "contains a literal inline HTML block " +
      '(`<div class="actian-section-list">` + `<a>` links)',
  },
];

test("known-unsafe files are walked AND excluded from the fresh classification (pin)", async () => {
  const walked = editableSourceFiles();
  const freshSet = await fresh();
  for (const { path: rel, reason } of KNOWN_UNSAFE) {
    // Must be WALKED: if the file is renamed or deleted, this assertion fails
    // loudly instead of vacuously passing because the path no longer appears
    // (the existsSync-skip shape this whole generator was built to kill).
    assert.ok(
      walked.includes(rel),
      `${rel} must still be walked by editableSourceFiles (if it was ` +
        "renamed or deleted, update this pin rather than letting it " +
        "silently drop out)",
    );
    // Must be absent from the FRESH set, not merely the committed JSON:
    // checking the committed JSON would be tautological (the generator wrote
    // it with this same classifier).
    assert.ok(
      !freshSet.includes(rel),
      `${rel} must stay OUT of the rich-safe set: ${reason}. If you changed ` +
        "the file so it is now genuinely rich-safe: fix the file, run " +
        "`npm run gen:safe-paths` to regenerate, then remove this entry.",
    );
  }
});
