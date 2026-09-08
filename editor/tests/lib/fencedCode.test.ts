// The three shapes four separate fence parsers used to get wrong, each in its
// own way. Written against the shared rule so a fifth caller inherits them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fencedLineMask } from "../../src/lib/fencedCode";

function inside(text: string): string[] {
  const lines = text.split("\n");
  return fencedLineMask(text).flatMap((f, i) => (f ? [lines[i]!] : []));
}

test("fencedLineMask: a ``` block hides its contents and its delimiters", () => {
  assert.deepEqual(inside("a\n```\ncode\n```\nb\n"), ["```", "code", "```"]);
});

test("fencedLineMask: a ~~~ block does too, which two scanners used to miss", () => {
  assert.deepEqual(inside("a\n~~~\ncode\n~~~\nb\n"), ["~~~", "code", "~~~"]);
});

test("fencedLineMask: an inner ``` does not close an outer ~~~", () => {
  // The regression a `/^(?:```|~~~)/` toggle introduces: the inner backticks
  // close the outer tildes and everything after becomes live.
  const text = "~~~\n```\n## Hidden\n```\n~~~\n\n## Real\n";
  assert.deepEqual(inside(text), ["~~~", "```", "## Hidden", "```", "~~~"]);
});

test("fencedLineMask: a longer outer fence survives a shorter inner one", () => {
  const text = "````\n```\n## Hidden\n```\n````\n\n## Real\n";
  assert.deepEqual(inside(text), ["````", "```", "## Hidden", "```", "````"]);
});

test("fencedLineMask: an inline marker in prose opens nothing", () => {
  // Not line-anchored is what `searchBodyText.FENCED_CODE_RE` got wrong: an
  // apostrophe-like ``` mid-sentence opened a fence for the index alone.
  const text = "Write ``` to open a fence.\n\n## Real\n\nAnd ``` closes it.\n";
  assert.deepEqual(inside(text), []);
});

test("fencedLineMask: an unterminated fence stays open to the end", () => {
  // The trailing "" is the element `split("\n")` yields for the final newline,
  // and it IS inside the unterminated fence. Listing it is the honest
  // expectation; omitting it was my error, not the mask's.
  assert.deepEqual(inside("a\n```\ncode\nmore\n"), ["```", "code", "more", ""]);
});

test("fencedLineMask: up to three spaces of indent still opens a fence, four does not", () => {
  assert.deepEqual(inside("   ```\ncode\n   ```\n"), ["   ```", "code", "   ```"]);
  assert.deepEqual(inside("    ```\ncode\n    ```\n"), []);
});

test("fencedLineMask: a closing run must be at least as long as the opening one", () => {
  // The ``` does not close the ````, so the block runs to the end.
  assert.deepEqual(inside("````\ncode\n```\nafter\n"), [
    "````",
    "code",
    "```",
    "after",
    "",
  ]);
});

test("fencedLineMask: a delimiter line with trailing content does not close", () => {
  // An info string is allowed on the OPENING line only.
  assert.deepEqual(inside("```js\ncode\n``` trailing\n```\nafter\n"), [
    "```js",
    "code",
    "``` trailing",
    "```",
  ]);
});

// ── The envelope is not the body ────────────────────────────────────────────
//
// Both scanners skip the YAML frontmatter envelope by advancing past its
// closing `---`, but the mask was computed over the WHOLE document. A YAML
// block scalar whose content line starts with three backticks opened a fence
// the envelope's `---` cannot close, and every body line inherited it: the
// file's headings vanished entirely, taking the outline, the relations rail
// and the outgoing count with them. Introduced when the toggle (which lived
// inside the loop, and so began after the envelope) became a whole-document
// mask.
test("fencedLineMask: masking can start below the frontmatter envelope", () => {
  const text =
    "---\ndescription: |\n  ```\n  code\n---\n\n## Real {#real}\n\nBody.\n";
  const headingLine = text.split("\n").indexOf("## Real {#real}");

  // Whole-document: the odd delimiter inside the envelope swallows the body.
  assert.equal(fencedLineMask(text)[headingLine], true);

  // From the body: the envelope cannot reach it.
  assert.equal(fencedLineMask(text, 5)[headingLine], false);
});

test("fencedLineMask: a start index reports every earlier line as outside", () => {
  const text = "```\ncode\n```\n## Real\n";
  const mask = fencedLineMask(text, 3);
  assert.deepEqual(mask.slice(0, 3), [false, false, false]);
  assert.equal(mask[3], false);
});

test("fencedLineMask: a balanced fence inside frontmatter was always harmless", () => {
  const text =
    "---\ndescription: |\n  ```\n  code\n  ```\n---\n\n## Real {#real}\n";
  const headingLine = text.split("\n").indexOf("## Real {#real}");
  assert.equal(fencedLineMask(text)[headingLine], false);
});
