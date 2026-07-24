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
    const rebuilt = assembleYamlFrontmatterFile(split.frontmatterText!, split.body);
    assert.equal(rebuilt, original, `${file} did not round-trip`);
  }
});

test("trailing blank lines in the YAML block do not accumulate", () => {
  const out = assembleYamlFrontmatterFile("slug: x\n\n\n", "body\n");
  assert.equal(out, "---\nslug: x\n---\nbody\n");
});

test("an edited value lands in the output verbatim", () => {
  const out = assembleYamlFrontmatterFile("label: Dataset ✎", "# Title\n");
  assert.equal(out, "---\nlabel: Dataset ✎\n---\n# Title\n");
});
