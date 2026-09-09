import { test } from "node:test";
import assert from "node:assert/strict";
import { scanHeadings } from "../../src/lib/headingScan";

test("scanHeadings: extracts H1/H2/H3 with level + text + line", () => {
  const md = `# Top\n\n## Section A\n\n### Sub a1\n\nbody\n\n## Section B\n`;
  const h = scanHeadings(md);
  assert.deepEqual(h, [
    { level: 1, text: "Top", line: 0 },
    { level: 2, text: "Section A", line: 2 },
    { level: 3, text: "Sub a1", line: 4 },
    { level: 2, text: "Section B", line: 8 },
  ]);
});

test("scanHeadings: ignores H4 and below", () => {
  const md = `# H1\n#### H4 ignored\n##### H5 ignored\n`;
  const h = scanHeadings(md);
  assert.deepEqual(h, [{ level: 1, text: "H1", line: 0 }]);
});

test("scanHeadings: ignores headings inside fenced code blocks", () => {
  const md = `# Real\n\n\`\`\`\n## Not a heading\n### Also not\n\`\`\`\n\n## Real too\n`;
  const h = scanHeadings(md);
  assert.deepEqual(
    h.map((x) => x.text),
    ["Real", "Real too"],
  );
});

test("scanHeadings: strips trailing {#anchor} from display text", () => {
  const md = `## Color contrast {#color-contrast}\n### Focus rings {#focus}\n`;
  const h = scanHeadings(md);
  assert.equal(h[0]!.text, "Color contrast");
  assert.equal(h[1]!.text, "Focus rings");
});

test("scanHeadings: skips blank-text headings", () => {
  const md = `# \n##   \n# Real\n`;
  const h = scanHeadings(md);
  assert.equal(h.length, 1);
  assert.equal(h[0]!.text, "Real");
});

test("scanHeadings: empty input returns empty array", () => {
  assert.deepEqual(scanHeadings(""), []);
});

test("scanHeadings: line numbers are 0-indexed and accurate", () => {
  const md = `intro\n# First\nbody\nbody\n## Second\n`;
  const h = scanHeadings(md);
  assert.equal(h[0]!.line, 1);
  assert.equal(h[1]!.line, 4);
});

test("scanHeadings: requires space after #", () => {
  const md = `#NoSpace\n# WithSpace\n`;
  const h = scanHeadings(md);
  assert.equal(h.length, 1);
  assert.equal(h[0]!.text, "WithSpace");
});

test("scanHeadings: skips lines inside the YAML frontmatter envelope", () => {
  const md = `---
# P8 transversal refs — file-scoped
# inventory lives in [[doc]]
a11y_refs:
  - { ref: typography }
---

## Real H2
### Real H3
`;
  const h = scanHeadings(md);
  assert.deepEqual(
    h.map((x) => x.text),
    ["Real H2", "Real H3"],
  );
});

test("scanHeadings: ignores '---' that is not at the very top (no frontmatter)", () => {
  const md = `# Intro\n\n---\n\n# After divider should still scan as heading\n`;
  const h = scanHeadings(md);
  assert.deepEqual(
    h.map((x) => x.text),
    ["Intro", "After divider should still scan as heading"],
  );
});

// ── Three modules, one grammar ──────────────────────────────────────────────
//
// `anchorIndex.HEADING_ANCHOR_RE` and `SectionFocusTracker.TRAILING_ANCHOR_RE`
// both require an explicit anchor to start with a letter. `headingScan`
// allowed a digit, so `## {#2fa}` split them: headingScan stripped the anchor,
// found empty text and DROPPED the heading; SectionFocusTracker kept it and
// derived "2fa" — an anchor the index can never define, on a section with no
// outline row, which then owned file scope invisibly.
test("headingScan: an explicit anchor must start with a letter, as the index requires", () => {
  // Not an anchor: the braces stay part of the title, which is what
  // SectionFocusTracker already does.
  const digitLed = scanHeadings("## Tokens {#2fa}\n\nBody.\n");
  assert.equal(digitLed.length, 1);
  assert.equal(digitLed[0]!.text, "Tokens {#2fa}");

  // A letter-leading anchor is still stripped from the title.
  const letterLed = scanHeadings("## Tokens {#tok2}\n\nBody.\n");
  assert.equal(letterLed[0]!.text, "Tokens");
});

// ── One fence grammar, shared with the reference index ─────────────────────
//
// `searchBodyText.stripFencedCode` — which `anchorIndex` uses to decide what
// text can define or reference an anchor — honours ``` and ~~~ alike. Both
// heading scanners toggled on ``` only, so a heading inside a ~~~ block got an
// outline row and a pill while the index ignored the whole block: the outline
// claimed a section the index would never resolve a reference for.
test("headingScan: a heading inside a ~~~ fence is not a section, as inside ```", () => {
  const backtick = scanHeadings("```\n## Fenced\n```\n\n## Real\n\nBody.\n");
  assert.deepEqual(
    backtick.map((h) => h.text),
    ["Real"],
  );
  const tilde = scanHeadings("~~~\n## Fenced\n~~~\n\n## Real\n\nBody.\n");
  assert.deepEqual(
    tilde.map((h) => h.text),
    ["Real"],
    "a ~~~ fence must hide its headings too",
  );
});

test("headingScan: an inner ``` does not close an outer ~~~, so its heading stays hidden", () => {
  // The regression a plain `/^(?:```|~~~)/` toggle introduces: the inner
  // backticks close the outer tildes and every heading after becomes live —
  // including, measured, the one the file's outgoing count lands on.
  const out = scanHeadings(
    "~~~\n```\n## Hidden {#hidden}\n```\n~~~\n\n## Real {#real}\n\nBody.\n",
  );
  assert.deepEqual(
    out.map((h) => h.text),
    ["Real"],
  );
});

test("headingScan: an inline fence marker in prose opens nothing", () => {
  const out = scanHeadings(
    "Write ``` to open a fence.\n\n## Real {#real}\n\nAnd ``` closes it.\n",
  );
  assert.deepEqual(
    out.map((h) => h.text),
    ["Real"],
  );
});

test("headingScan: a fenced block does not shift the line number of a heading below it", () => {
  const out = scanHeadings("a\n```\ncode\n```\n## Real\n");
  assert.equal(out.length, 1);
  assert.equal(out[0]!.line, 4, "the heading is on line 4 of the original text");
});

test("headingScan: a fence opener inside the frontmatter envelope does not blank the body", () => {
  // A YAML block scalar can carry a line of three backticks. It is not a
  // document fence, and the envelope's closing `---` cannot close it, so a
  // whole-document mask made every heading in the file disappear — taking the
  // outline, the relations rail and the file's outgoing count with them.
  const out = scanHeadings(
    "---\ndescription: |\n  ```\n  code\n---\n\n## Real {#real}\n\nBody.\n",
  );
  assert.deepEqual(
    out.map((h) => h.text),
    ["Real"],
  );
  assert.equal(out[0]!.line, 6, "and it keeps its real line number");
});
