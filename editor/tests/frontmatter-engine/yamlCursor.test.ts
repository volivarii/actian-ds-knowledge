import { test } from "node:test";
import assert from "node:assert/strict";
import { yamlCursorAt } from "../../src/frontmatter-engine/yamlCursor";

/** Build (text, offset) from a string containing a single `|` caret marker. */
function at(marked: string): [string, number] {
  const offset = marked.indexOf("|");
  assert.notEqual(offset, -1, "test input needs a | caret");
  return [marked.replace("|", ""), offset];
}

test("a bare partial on a fresh top-level line is a key position", () => {
  const [text, offset] = at("slug: dataset\nlab|");
  const c = yamlCursorAt(text, offset);
  assert.deepEqual(c, {
    kind: "key",
    path: [],
    key: null,
    partial: "lab",
    from: offset - 3,
    siblings: ["slug"],
  });
});

test("an empty top-level line is a key position with no partial", () => {
  const [text, offset] = at("slug: dataset\n|");
  const c = yamlCursorAt(text, offset);
  assert.equal(c?.kind, "key");
  assert.equal(c?.partial, "");
  assert.deepEqual(c?.path, []);
});

test("an indented key nests under the nearest shallower key", () => {
  const [text, offset] = at("relationships:\n  hasFi|");
  const c = yamlCursorAt(text, offset);
  assert.equal(c?.kind, "key");
  assert.deepEqual(c?.path, ["relationships"]);
  assert.equal(c?.partial, "hasFi");
});

test("a sequence item's keys nest under the sequence's key", () => {
  const [text, offset] = at("properties:\n  - name: status\n    ty|");
  const c = yamlCursorAt(text, offset);
  assert.equal(c?.kind, "key");
  assert.deepEqual(c?.path, ["properties"]);
  assert.equal(c?.partial, "ty");
  assert.deepEqual(c?.siblings, ["name"]);
});

test("after a colon the cursor is a value position", () => {
  const [text, offset] = at("label: Data|");
  const c = yamlCursorAt(text, offset);
  assert.equal(c?.kind, "value");
  assert.equal(c?.key, "label");
  assert.equal(c?.partial, "Data");
  assert.deepEqual(c?.path, []);
});

test("a dash-prefixed scalar item is a value position under its key", () => {
  const [text, offset] = at("apps:\n  - stu|");
  const c = yamlCursorAt(text, offset);
  assert.equal(c?.kind, "value");
  assert.equal(c?.key, "apps");
  assert.equal(c?.partial, "stu");
});

test("a comment line yields no cursor", () => {
  const [text, offset] = at("# yaml-language-server: $sch|");
  assert.equal(yamlCursorAt(text, offset), null);
});

test("inside a flow mapping yields no cursor", () => {
  const [text, offset] = at("properties:\n  - { name: orphan, ty|");
  assert.equal(yamlCursorAt(text, offset), null);
});

// The test above passes even without the bail-out it claims to pin: for
// that exact input, VALUE_POSITION, SEQ_SCALAR_POSITION, and KEY_POSITION
// all independently fail to match (the `{` structurally breaks each
// pattern), so `yamlCursorAt` falls through to its trailing `return null`
// regardless. It documents intent but does not discriminate. These two
// do: each is a shape one of the position regexes matches on its own, so
// deleting the bail-out line flips the assertion.
test("a flow mapping brace mid-value yields no cursor, not a value cursor", () => {
  // Without the bail-out, VALUE_POSITION matches this and would return
  // `{ kind: "value", key: "tags", partial: "{a, b" }`.
  const [text, offset] = at("tags: {a, b|");
  assert.equal(yamlCursorAt(text, offset), null);
});

test("a flow sequence bracket inside a scalar item yields no cursor, not a seq-scalar cursor", () => {
  // Not the brief's literal `- [a, b` shape: SEQ_SCALAR_POSITION's own
  // `[^{[\s]` character class already excludes a `[`/`{` as the very
  // first character after `- `, so that shape returns null with or
  // without the bail-out and would not discriminate either. A bracket
  // that isn't the first character (e.g. embedded in the item's text)
  // has no such protection from the regex itself: without the bail-out,
  // SEQ_SCALAR_POSITION matches this and would return
  // `{ kind: "value", key: "properties", partial: "status[wip" }`.
  const [text, offset] = at("properties:\n  - status[wip|");
  assert.equal(yamlCursorAt(text, offset), null);
});
