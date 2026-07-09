import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlainMarkdown } from "../../src/app/EditorShell";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";

test("root-level safe content files are plain-markdown editable", () => {
  assert.equal(isPlainMarkdown("content/src/global-guidelines.md"), true);
  assert.equal(isPlainMarkdown("content/src/format-spec.md"), true);
});

test("structural / meta content files are NOT routed to the markdown editor", () => {
  assert.equal(isPlainMarkdown("content/src/content-index.md"), false);
  assert.equal(isPlainMarkdown("content/src/AUTHORING.md"), false);
  assert.equal(isPlainMarkdown("content/src/README.md"), false);
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
