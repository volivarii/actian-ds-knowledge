import test from "node:test";
import assert from "node:assert/strict";
import { nothingToSubmit } from "../../src/app/FrontmatterBodyEditScreen";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";
import { assembleFrontmatterFilePreservingComments } from "../../src/form-engine/yamlSerializer";

// #631: the rule that decides whether a save leaves the batch. Extracted from
// the screen because the screen cannot express these cases: the prose surface
// is CodeMirror in source mode (no textbox to type into under happy-dom) and
// Milkdown in rich mode, and a reopened-from-the-batch donor needs a second
// mount. The two paths the screen CAN drive are covered end to end in
// frontmatterRevertLeavesBatch.test.
const MAIN = "---\nslug: dataset\nlabel: Dataset\nprops:\n  - { name: orphan, states: [Present, Orphan] }\n---\nProse about datasets.\n";
const split = splitFrontmatter(MAIN);
const VALUES = split.data;
const BODY = split.body;
const base = {
  baseline: MAIN,
  body: BODY,
  formData: VALUES,
  frontmatterText: split.frontmatterText ?? "",
  yamlActive: false,
};

test("the assembled file being main's bytes is nothing to submit", () => {
  assert.equal(nothingToSubmit({ ...base, content: MAIN }), true);
});

test("values and body back to main is nothing to submit, even when the bytes differ", () => {
  // The reopened-from-the-batch shape: `content` was assembled from the cart's
  // donor, so it carries an earlier reformat and can never equal main.
  const reformatted = assembleFrontmatterFilePreservingComments(
    { ...(VALUES as Record<string, unknown>), label: "Datasets" },
    split.frontmatterText,
    BODY,
  ).replace("Datasets", "Dataset");
  assert.notEqual(reformatted, MAIN, "the fixture is not a reformat, so this case is not covered");
  assert.equal(nothingToSubmit({ ...base, content: reformatted }), true);
});

test("a body edit is something to submit, though every frontmatter value still matches main", () => {
  // The half that would silently discard an author's prose.
  const edited = BODY + "\nA sentence the author wrote.\n";
  const content = assembleFrontmatterFilePreservingComments(VALUES, split.frontmatterText, edited);
  assert.equal(nothingToSubmit({ ...base, body: edited, content }), false);
});

test("a frontmatter edit is something to submit", () => {
  const data = { ...(VALUES as Record<string, unknown>), label: "Datasets" };
  const content = assembleFrontmatterFilePreservingComments(data, split.frontmatterText, BODY);
  assert.equal(nothingToSubmit({ ...base, formData: data, content }), false);
});

test("on the YAML surface the author's own text decides it", () => {
  const fm = split.frontmatterText ?? "";
  assert.equal(nothingToSubmit({ ...base, yamlActive: true, content: MAIN, frontmatterText: fm }), true);
  assert.equal(
    nothingToSubmit({ ...base, yamlActive: true, content: "different", frontmatterText: fm + "extra: 1\n" }),
    false,
    "an edit in the YAML pane was read as nothing to submit",
  );
});

test("a new file (no bytes on main) is always something to submit", () => {
  assert.equal(nothingToSubmit({ ...base, baseline: null, content: MAIN }), false);
});
