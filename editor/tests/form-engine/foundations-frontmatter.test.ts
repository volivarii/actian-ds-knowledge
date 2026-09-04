import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";
import { assembleFrontmatterFile } from "../../src/app/FrontmatterBodyEditScreen";
import { assembleFrontmatterFilePreservingComments } from "../../src/form-engine/yamlSerializer";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";

// Fixture modeled on the real foundations/src/tokens.md frontmatter:
// leading comment block + flow-style arrays of {ref, note}.
const FM = [
  "# P8 transversal refs - file-scoped (Option A). Authoritative subsection",
  "# inventory lives elsewhere; this file's refs are the union across sections.",
  "a11y_refs:",
  "  - { ref: typography, note: covers text token rules }",
  "  - { ref: focus-keyboard, note: focus-ring tokens }",
  "motion_refs:",
  "  - { ref: drawer-open-close }",
  "  - { ref: success-toast }",
].join("\n");
const FILE = `---\n${FM}\n---\n\nBody prose here.\n`;

test("foundations files route to the foundations form via the preserveComments path", () => {
  const m = matchFrontmatterForm("foundations/src/tokens.md");
  assert.equal(m?.schemaKey, "foundations");
  // foundations serializes through the comment-preserving Document path (not
  // flowAtDepth, which it no longer sets), and treats frontmatter as optional.
  assert.equal(m?.preserveComments, true);
  assert.equal(m?.frontmatterOptional, true);
  assert.equal(m?.flowAtDepth, undefined);
});

test("block-style serialize is semantically identical (dist-safe)", () => {
  const { data, frontmatterText, body } = splitFrontmatter(FILE);
  assert.ok(data); // parses under the yaml lib
  // An EDITED document, because an unedited one is returned verbatim (#631)
  // and this guard would compare the file with itself.
  const edited = { ...(data as Record<string, unknown>), _fixture_edit: "x" };
  const out = assembleFrontmatterFile(edited, frontmatterText, body, null);
  const reparsed = splitFrontmatter(out);
  // foundations-derive parses frontmatter via YAML.parse (scripts/lib/frontmatter.js),
  // so semantic equality of parsed data proves dist output is unchanged.
  assert.deepEqual(reparsed.data, edited);
});

test("leading comment block is preserved verbatim on save", () => {
  const { data, frontmatterText, body } = splitFrontmatter(FILE);
  // Edited, so the header is preserved by `extractLeadingHeader` rather than
  // by the unedited shortcut handing the bytes back untouched.
  const edited = { ...(data as Record<string, unknown>), _fixture_edit: "x" };
  const out = assembleFrontmatterFile(edited, frontmatterText, body, null);
  assert.ok(out.includes("# P8 transversal refs - file-scoped (Option A)"));
});

test("block style has no inline flow maps after serialize", () => {
  const { data, frontmatterText, body } = splitFrontmatter(FILE);
  // An EDITED document: block style is what the caller asked for, and the
  // inline `- { ref: ... }` maps must not survive it. Unedited data no longer
  // reaches the serializer at all (see the test below), so this now edits a
  // value first, which is the only way the flowAtDepth argument is reachable.
  const edited = { ...(data as Record<string, unknown>), _fixture_edit: "x" };
  const out = assembleFrontmatterFile(edited, frontmatterText, body, null);
  assert.ok(!/-\s*\{\s*ref:/.test(out)); // no `- { ref: ... }` flow maps remain
});

test("an unedited document comes back as the author's own bytes, whatever the flow setting", () => {
  // #631: re-emitting an unedited file is a reformat the author never asked
  // for, and it is what made 30 of 96 routed files unable to equal themselves
  // through their own save path. The request for block style applies to what
  // the author CHANGED; it is not a licence to rewrite what they did not.
  const { data, frontmatterText, body } = splitFrontmatter(FILE);
  assert.ok(frontmatterText);
  const out = assembleFrontmatterFile(data, frontmatterText, body, null);
  assert.equal(out, FILE, "an unedited save rewrote the file");
});

// The registry routes foundations through preserveComments, so the REAL save
// path is assembleFrontmatterFilePreservingComments — NOT assembleFrontmatterFile
// (which the tests above exercise, and which masked the Task-4 deletion bug for
// foundations). Cover the real path on a value edit.
test("real foundations save path (preserveComments) is dist-safe on a value edit", () => {
  const { data, frontmatterText, body } = splitFrontmatter(FILE);
  assert.ok(data && frontmatterText);
  // Edit a value the way the form would: rewrite one a11y ref note.
  const edited = {
    ...(data as Record<string, unknown>),
    a11y_refs: [
      { ref: "typography", note: "UPDATED token rules" },
      { ref: "focus-keyboard", note: "focus-ring tokens" },
    ],
  };
  const out = assembleFrontmatterFilePreservingComments(
    edited,
    frontmatterText,
    body,
  );
  // (i) reparsed data equals the intended edit — foundations-derive parses
  //     frontmatter semantically, so this proves the dist output is correct.
  const reparsed = splitFrontmatter(out);
  assert.deepEqual(reparsed.data, edited);
  // (ii) the leading `#` comment block survives the save.
  assert.ok(out.includes("# P8 transversal refs - file-scoped (Option A)"));
  assert.ok(out.includes("# inventory lives elsewhere"));
});
