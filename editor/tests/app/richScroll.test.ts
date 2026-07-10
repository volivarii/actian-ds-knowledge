// scrollRichHeading: rich-mode (Milkdown) equivalent of the CM6 heading
// scroll. Matches on rendered DOM text against a Heading from headingScan.
// Covers the anchor-stripping fix: headingScan strips a trailing `{#slug}`
// from Heading.text, but the rendered Milkdown DOM keeps it in textContent,
// so scrollRichHeading must strip it too before comparing.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { scanHeadings } from "../../src/lib/headingScan";
import { scrollRichHeading } from "../../src/app/richScroll";

afterEach(() => {
  document.body.innerHTML = "";
});

test("scrollRichHeading: scrolls to a heading whose rendered DOM text carries a literal {#anchor}", () => {
  document.body.innerHTML =
    '<div class="milkdown"><h2>Usage {#usage}</h2></div>';

  // Derive the Heading the same way MarkdownEditScreen's Outline does, so
  // this exercises the real headingScan -> scrollRichHeading contract
  // instead of a hand-built fixture.
  const [heading] = scanHeadings("## Usage {#usage}\n\nBody.\n");
  assert.ok(heading);
  assert.equal(heading.text, "Usage");

  const h2 = document.querySelector("h2")!;
  let called = 0;
  h2.scrollIntoView = () => {
    called += 1;
  };

  scrollRichHeading(heading);

  assert.equal(called, 1);
});

test("scrollRichHeading: no-ops when no heading in the DOM matches", () => {
  document.body.innerHTML =
    '<div class="milkdown"><h2>Style {#style}</h2></div>';

  const h2 = document.querySelector("h2")!;
  let called = 0;
  h2.scrollIntoView = () => {
    called += 1;
  };

  scrollRichHeading({ level: 2, text: "Usage", line: 0 });

  assert.equal(called, 0);
});
