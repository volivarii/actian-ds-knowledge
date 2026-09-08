// The three shapes four separate fence parsers used to get wrong, each in its
// own way. Written against the shared rule so a fifth caller inherits them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fencedLineMask, blankFencedCode } from "../../src/lib/fencedCode";

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

test("blankFencedCode: line numbers survive, so a heading below keeps its position", () => {
  const out = blankFencedCode("a\n```\ncode\n```\n## Real\n");
  assert.equal(out, "a\n\n\n\n## Real\n");
  assert.equal(out.split("\n").length, "a\n```\ncode\n```\n## Real\n".split("\n").length);
});
