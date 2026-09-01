import { test } from "node:test";
import assert from "node:assert/strict";
import { searchableText, stripFencedCode } from "../../src/lib/searchBodyText";

test("frontmatter delimiters do not leak, and the body follows its values", () => {
  const out = searchableText("---\nstatus: approved\n---\nUse sentence case.\n");
  assert.equal(out, "approved \u00b7 Use sentence case.");
  assert.ok(!out.includes("---"), out);
  assert.ok(!out.includes("status"), "the key names a field, not the guidance");
});

test("horizontal rules mid-document do not swallow the prose between them", () => {
  // Two rules and no frontmatter: an UNANCHORED frontmatter match reads the
  // first rule as an opening fence and eats everything up to the second. One
  // rule alone cannot show this, since there is nothing for it to match with.
  const out = searchableText(
    "Intro.\n\n---\n\nMiddle prose.\n\n---\n\nEnd.\n",
  );
  assert.ok(out.includes("Intro."), out);
  assert.ok(out.includes("Middle prose."), out);
  assert.ok(out.includes("End."), out);
});

test("fenced code is not searchable", () => {
  const out = searchableText("Guidance here.\n\n```js\nconst notProse = 1;\n```\n");
  assert.ok(out.includes("Guidance here."));
  assert.ok(!out.includes("notProse"), out);
});

test("stripFencedCode preserves the line count of what it removes", () => {
  // snippetExtract and the anchor scanner count lines through this.
  const before = "a\n```\nx\ny\n```\nb";
  assert.equal(stripFencedCode(before).split("\n").length, before.split("\n").length);
});

test("a link keeps its label and loses its target", () => {
  const out = searchableText("See [the button guidance](../button/content.md).");
  assert.equal(out, "See the button guidance.");
});

test("line furniture is dropped so a snippet reads as a sentence", () => {
  const out = searchableText("## When to use\n\n* Use a button to submit.\n> Note this.\n");
  assert.equal(out, "When to use Use a button to submit. Note this.");
});

test("case is preserved, because the snippet is shown to a person", () => {
  assert.equal(searchableText("Sentence Case Matters"), "Sentence Case Matters");
});

test("a file with nothing but machinery yields the empty string", () => {
  // Nothing an author wrote: no values, no prose. The generator drops these
  // rather than shipping an entry that can never match.
  assert.equal(searchableText("```\ncode only\n```\n"), "");
  assert.equal(searchableText("---\n---\n"), "");
  // A frontmatter-only file is NOT empty: its values are its content.
  assert.equal(searchableText("---\ntitle: Api key\n---\n"), "Api key");
});

// Found by looking at real snippets in the browser, not by a failing test:
// content/src/writing/capitalization.md put "*** When to use each case Title
// case | Sentence case | All caps | ------------…" in front of the reader.
test("a table reads as cells, not as pipes and dashes", () => {
  const out = searchableText(
    "| Title case | Sentence case |\n| ---------- | ------------- |\n| Menu items | Labels |\n",
  );
  assert.ok(!out.includes("---"), out);
  assert.ok(!out.includes("|"), out);
  assert.ok(out.includes("Title case"), out);
  assert.ok(out.includes("Sentence case"), out);
  assert.ok(out.includes("Menu items"), out);
});

test("a thematic break is not text", () => {
  for (const rule of ["***", "---", "___", "* * *"]) {
    const out = searchableText(`Above.\n\n${rule}\n\nBelow.\n`);
    assert.equal(out, "Above. Below.", `rule: ${rule}`);
  }
});

test("code spans and bold markers do not reach the reader", () => {
  assert.equal(
    searchableText("Show `Orders` with **Table** below it."),
    "Show Orders with Table below it.",
  );
});

// ── Frontmatter (the record domains) ────────────────────────────────────────
// For the domains the editor edits through a FORM, the frontmatter IS the
// guidance: content/src/writing/words-to-avoid.md keeps every word it tells you
// to avoid there, and all 64 app-context records keep their label, properties
// and apps there. Stripping it as "machinery" left the F2 defect open for
// exactly the files where the form hides the file best.

test("frontmatter values are searchable, its keys are not", () => {
  const out = searchableText(
    '---\ntitle: "Words to avoid"\nwordsToAvoid:\n  - avoid: ["blacklist", "whitelist"]\n    reason: "Don\'t use it."\n---\nBody text.\n',
  );
  assert.ok(out.includes("whitelist"), out);
  assert.ok(out.includes("Don't use it."), out);
  assert.ok(out.includes("Body text."), out);
  // `wordsToAvoid`, `avoid` and `reason` name the form's fields, not its
  // content: a search for "reason" should not return every record.
  assert.ok(!out.includes("wordsToAvoid"), out);
  assert.ok(!out.includes("reason"), out);
});

test("a nested inline map contributes its values", () => {
  const out = searchableText(
    '---\nproperties:\n  - expiration date\nexample: { do: "Contact Support", dont: "Please contact" }\n---\n',
  );
  assert.ok(out.includes("expiration date"), out);
  assert.ok(out.includes("Contact Support"), out);
  assert.ok(!out.includes("dont"), out);
});

test("malformed frontmatter costs the body, not the run", () => {
  const out = searchableText("---\nthis: [is: not: yaml\n---\nThe body survives.\n");
  assert.ok(out.includes("The body survives."), out);
});

test("a document with no frontmatter is unchanged", () => {
  assert.equal(searchableText("Just prose."), "Just prose.");
});
