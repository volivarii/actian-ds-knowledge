import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";
import { assembleYamlFrontmatterFile } from "../../src/frontmatter-engine/assembleYaml";

const AC_DIR = new URL("../../../app-context/src/", import.meta.url).pathname;

function recordFiles(): string[] {
  const out: string[] = [];
  for (const sub of ["apps", "entities", "patterns"]) {
    const dir = join(AC_DIR, sub);
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".md")) out.push(join(dir, f));
    }
  }
  return out;
}

test("every app-context record round-trips byte-identically", () => {
  const files = recordFiles();
  assert.ok(files.length > 20, `expected the real corpus, got ${files.length}`);
  for (const file of files) {
    const original = readFileSync(file, "utf8");
    const split = splitFrontmatter(original);
    assert.notEqual(split.frontmatterText, null, `${file} has no frontmatter`);
    const rebuilt = assembleYamlFrontmatterFile(
      split.frontmatterText!,
      split.body,
    );
    assert.equal(rebuilt, original, `${file} did not round-trip`);
  }
});

test("the author's YAML text is emitted verbatim, blank lines included", () => {
  // Same input as the trim-era version of this test, opposite expectation:
  // trailing blank lines in the author's own text are no longer stripped.
  const out = assembleYamlFrontmatterFile("slug: x\n\n\n", "body\n");
  assert.equal(out, "---\nslug: x\n\n\n\n---\nbody\n");
});

test("an edited value lands in the output verbatim", () => {
  const out = assembleYamlFrontmatterFile("label: Dataset ✎", "# Title\n");
  assert.equal(out, "---\nlabel: Dataset ✎\n---\n# Title\n");
});

test("a blank line before the closing fence round-trips exactly", () => {
  // The fix for the confirmed finding: splitFrontmatter's non-greedy regex
  // folds a blank line before the closing fence into frontmatterText (here
  // "slug: x\n"), and the trim this task removes used to silently drop it.
  const original = "---\nslug: x\n\n---\nbody\n";
  const split = splitFrontmatter(original);
  assert.notEqual(split.frontmatterText, null);
  const rebuilt = assembleYamlFrontmatterFile(
    split.frontmatterText!,
    split.body,
  );
  assert.equal(rebuilt, original);
});

test("a CRLF-fenced source is documented to come back with LF fences", () => {
  // Accepted by FRONTMATTER_RE but currently zero instances in the
  // substrate (verified 2026-07-24 across all 96 fenced files). Fences
  // normalize to LF; CRLF sequences inside the YAML text or body, which
  // this function never touches, are left exactly as they were.
  const original = "---\r\nslug: x\r\nlabel: Y\r\n---\r\nbody\r\n";
  const split = splitFrontmatter(original);
  assert.notEqual(split.frontmatterText, null);
  const rebuilt = assembleYamlFrontmatterFile(
    split.frontmatterText!,
    split.body,
  );
  assert.equal(rebuilt, "---\nslug: x\r\nlabel: Y\n---\nbody\r\n");
});

test("a source with no trailing newline after the closing fence gains one", () => {
  // Accepted by FRONTMATTER_RE (the trailing `\r?\n?` is optional) but
  // currently zero instances in the substrate (verified 2026-07-24 across
  // all 96 fenced files).
  const original = "---\nslug: x\n---";
  const split = splitFrontmatter(original);
  assert.notEqual(split.frontmatterText, null);
  const rebuilt = assembleYamlFrontmatterFile(
    split.frontmatterText!,
    split.body,
  );
  assert.equal(rebuilt, "---\nslug: x\n---\n");
});
