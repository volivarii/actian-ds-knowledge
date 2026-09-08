// The relations rail counts reference SITES where a reader counts FILES, and
// lists generated targets that refuse to open (#684). `incomingFiles` is the
// one place that turns raw IncomingRefs into what the rail should say: one row
// per distinct editable file, and a stated count of what was left out — never
// a silent drop, because absence that does not state its cause reads as "there
// is nothing there".
import { test } from "node:test";
import assert from "node:assert/strict";
import { incomingFiles } from "../../src/lib/incomingFiles";
import type { IncomingRef } from "../../src/lib/referenceIndex";

function ref(fromPath: string, snippet = ""): IncomingRef {
  return { fromPath, slug: "token-basics", snippet };
}

test("incomingFiles: repeated sites in one file collapse to one row carrying the site count", () => {
  const { files } = incomingFiles([
    ref("components/src/categories/overlays.md", "first"),
    ref("components/src/categories/overlays.md", "second"),
    ref("components/src/categories/overlays.md", "third"),
    ref("components/src/categories/form.md", "only"),
  ]);

  assert.equal(files.length, 2);
  assert.equal(files[0]!.path, "components/src/categories/overlays.md");
  assert.equal(files[0]!.sites, 3);
  assert.equal(files[1]!.path, "components/src/categories/form.md");
  assert.equal(files[1]!.sites, 1);
});

test("incomingFiles: a file's first snippet is the one carried onto its row", () => {
  const { files } = incomingFiles([
    ref("components/src/categories/overlays.md", "first"),
    ref("components/src/categories/overlays.md", "second"),
  ]);

  assert.equal(files[0]!.snippet, "first");
});

test("incomingFiles: generated targets are excluded and counted, not silently dropped", () => {
  // Every shape getPathTier calls read-only: a domain dist tree, the derived
  // token outputs, and the generated root index. None of these open in the
  // editor, so a row pointing at one is a dead end.
  const { files, generatedExcluded } = incomingFiles([
    ref("foundations/src/design-guidelines.md"),
    ref("foundations/dist/foundations.bundle.json"),
    ref("components/dist/guidelines/badge.json"),
    ref("tokens/tokens.css"),
    ref("llms.txt"),
  ]);

  assert.deepEqual(
    files.map((f) => f.path),
    ["foundations/src/design-guidelines.md"],
  );
  assert.equal(generatedExcluded, 4);
});

test("incomingFiles: the excluded count counts files, not sites, so one noisy generated file counts once", () => {
  const { generatedExcluded } = incomingFiles([
    ref("foundations/dist/foundations.bundle.json"),
    ref("foundations/dist/foundations.bundle.json"),
    ref("foundations/dist/foundations.bundle.json"),
  ]);

  assert.equal(generatedExcluded, 1);
});

test("incomingFiles: order follows first appearance, so the rail does not reshuffle between renders", () => {
  const { files } = incomingFiles([
    ref("components/src/categories/navigation.md"),
    ref("components/src/categories/action.md"),
    ref("components/src/categories/navigation.md"),
  ]);

  assert.deepEqual(
    files.map((f) => f.path),
    [
      "components/src/categories/navigation.md",
      "components/src/categories/action.md",
    ],
  );
});

test("incomingFiles: nothing in, nothing out, and nothing claimed to be excluded", () => {
  const { files, generatedExcluded } = incomingFiles([]);
  assert.deepEqual(files, []);
  assert.equal(generatedExcluded, 0);
});

test("incomingFiles: the row takes the first NON-EMPTY snippet, not merely the first", () => {
  // `incomingForFile` pushes `snippet: ""` for a reference with no matching
  // body paragraph — one living in the referrer's frontmatter (a11y_refs and
  // friends). It iterates slugs in Set order, so in the unscoped rail a file
  // that references anchor A from frontmatter and anchor B from prose can
  // arrive empty-first. Keeping the first would collapse it to a row with no
  // context line at all, losing what the pre-grouping rail showed.
  const { files } = incomingFiles([
    ref("components/src/categories/overlays.md", ""),
    ref("components/src/categories/overlays.md", "the prose one"),
  ]);
  assert.equal(files.length, 1);
  assert.equal(files[0]!.snippet, "the prose one");
});

test("incomingFiles: a file with no snippet anywhere still renders, with none", () => {
  const { files } = incomingFiles([
    ref("components/src/categories/overlays.md", ""),
    ref("components/src/categories/overlays.md", ""),
  ]);
  assert.equal(files.length, 1);
  assert.equal(files[0]!.snippet, "");
});
