// scrollRichHeading: rich-mode (Milkdown) equivalent of the CM6 heading
// scroll. Index-based (not text-matching): duplicate heading text must
// resolve to the DOM node at the same index, and a heading with inline
// markdown (e.g. backticks), whose rendered textContent differs from
// headingScan's plain Heading.text, must still resolve correctly.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { scanHeadings } from "../../src/lib/headingScan";
import { scrollRichHeading } from "../../src/app/richScroll";

afterEach(() => {
  document.body.innerHTML = "";
});

test("scrollRichHeading: scrolls to the heading at the given index", () => {
  document.body.innerHTML =
    '<div class="milkdown"><h1>Title</h1><h2>Usage</h2><h3>Style</h3></div>';

  const headings = scanHeadings("# Title\n\n## Usage\n\n### Style\n\nBody.\n");
  const usage = headings[1]!;
  assert.equal(usage.text, "Usage");

  const h2 = document.querySelector("h2")!;
  let called = 0;
  h2.scrollIntoView = () => {
    called += 1;
  };

  scrollRichHeading(usage, 1);

  assert.equal(called, 1);
});

test("scrollRichHeading: duplicate heading text, clicking index 1 scrolls the SECOND matching DOM node, not the first", () => {
  document.body.innerHTML =
    '<div class="milkdown"><h2 id="first">Usage</h2><h2 id="second">Usage</h2></div>';

  const headings = scanHeadings("## Usage\n\nOne.\n\n## Usage\n\nTwo.\n");
  assert.equal(headings.length, 2);
  const second = headings[1]!;

  const [first, secondNode] = Array.from(document.querySelectorAll("h2"));
  let firstCalled = 0;
  let secondCalled = 0;
  first!.scrollIntoView = () => {
    firstCalled += 1;
  };
  secondNode!.scrollIntoView = () => {
    secondCalled += 1;
  };

  scrollRichHeading(second, 1);

  assert.equal(firstCalled, 0);
  assert.equal(secondCalled, 1);
});

test("scrollRichHeading: a heading with backticks (inline markdown) resolves by index, not text equality", () => {
  document.body.innerHTML =
    '<div class="milkdown"><h2><code>useEffect</code> pitfalls</h2></div>';

  // headingScan keeps the raw markdown in Heading.text (it doesn't render
  // inline markup), so it never equals the DOM's rendered textContent;
  // index-based resolution must not care.
  const headings = scanHeadings("## `useEffect` pitfalls\n\nBody.\n");
  const heading = headings[0]!;
  assert.equal(heading.text, "`useEffect` pitfalls");

  const h2 = document.querySelector("h2")!;
  let called = 0;
  h2.scrollIntoView = () => {
    called += 1;
  };

  scrollRichHeading(heading, 0);

  assert.equal(called, 1);
});

test("scrollRichHeading: no-ops when the index is out of range", () => {
  document.body.innerHTML = '<div class="milkdown"><h2>Style</h2></div>';

  const h2 = document.querySelector("h2")!;
  let called = 0;
  h2.scrollIntoView = () => {
    called += 1;
  };

  scrollRichHeading({ level: 2, text: "Usage", line: 0 }, 5);

  assert.equal(called, 0);
});

test("scrollRichHeading: no-ops when there is no .milkdown root", () => {
  document.body.innerHTML = "<h2>Usage</h2>";

  const h2 = document.querySelector("h2")!;
  let called = 0;
  h2.scrollIntoView = () => {
    called += 1;
  };

  scrollRichHeading({ level: 2, text: "Usage", line: 0 }, 0);

  assert.equal(called, 0);
});

test("scrollRichHeading: only queries h1-h3, matching headingScan's level range (an H4+ in the DOM does not shift indices)", () => {
  document.body.innerHTML =
    '<div class="milkdown"><h2>Usage</h2><h4>Aside</h4><h2>Style</h2></div>';

  const headings = scanHeadings("## Usage\n\n#### Aside\n\n## Style\n\n");
  // headingScan only sees the two H2s (H4+ is out of its range).
  assert.equal(headings.length, 2);
  const style = headings[1]!;

  const h2s = Array.from(document.querySelectorAll("h2"));
  let firstCalled = 0;
  let secondCalled = 0;
  h2s[0]!.scrollIntoView = () => {
    firstCalled += 1;
  };
  h2s[1]!.scrollIntoView = () => {
    secondCalled += 1;
  };

  scrollRichHeading(style, 1);

  assert.equal(firstCalled, 0);
  assert.equal(secondCalled, 1);
});
