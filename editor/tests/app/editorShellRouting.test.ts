import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlainMarkdown } from "../../src/app/EditorShell";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";

test("root-level content files now route to the content form, not plain markdown", () => {
  assert.equal(isPlainMarkdown("content/src/global-guidelines.md"), false);
  assert.equal(isPlainMarkdown("content/src/format-spec.md"), false);
  assert.equal(
    matchFrontmatterForm("content/src/global-guidelines.md")?.schemaKey,
    "content",
  );
  assert.equal(
    matchFrontmatterForm("content/src/format-spec.md")?.schemaKey,
    "content",
  );
});

test("structural / meta content files are NEITHER plain markdown NOR form-routed", () => {
  for (const p of [
    "content/src/content-index.md",
    "content/src/AUTHORING.md",
    "content/src/README.md",
  ]) {
    assert.equal(isPlainMarkdown(p), false, `${p} not plain markdown`);
    assert.equal(matchFrontmatterForm(p), null, `${p} not form-routed`);
  }
});

test("existing plain-markdown routing is unchanged", () => {
  assert.equal(isPlainMarkdown("accessibility/src/intro.md"), true);
});

test("foundations files now route to the foundations form, not plain markdown", () => {
  assert.equal(isPlainMarkdown("foundations/src/intro.md"), false);
  assert.equal(
    matchFrontmatterForm("foundations/src/intro.md")?.schemaKey,
    "foundations",
  );
});

test("content/src/writing files now route to the generic content form, not plain markdown", () => {
  assert.equal(isPlainMarkdown("content/src/writing/plurals.md"), false);
  assert.equal(
    matchFrontmatterForm("content/src/writing/plurals.md")?.schemaKey,
    "content",
  );
});
