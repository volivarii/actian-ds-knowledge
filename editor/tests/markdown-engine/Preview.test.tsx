import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, fireEvent } from "@testing-library/react";
import { Preview } from "../../src/markdown-engine/Preview";

test("Preview: renders headings", () => {
  const { container } = render(<Preview text={"# Hello\n\n## World"} />);
  assert.equal(container.querySelector("h1")?.textContent, "Hello");
  assert.equal(container.querySelector("h2")?.textContent, "World");
});

test("Preview: renders GFM tables", () => {
  const { container } = render(
    <Preview text={"| A | B |\n|---|---|\n| 1 | 2 |\n"} />,
  );
  assert.ok(container.querySelector("table"));
  assert.equal(container.querySelectorAll("td").length, 2);
});

test("Preview: rehype-slug assigns heading ids", () => {
  const { container } = render(<Preview text="## Color Tokens" />);
  const h2 = container.querySelector("h2");
  assert.equal(h2?.id, "color-tokens");
});

test("Preview: renders lists", () => {
  const { container } = render(<Preview text={"- one\n- two\n"} />);
  assert.equal(container.querySelectorAll("li").length, 2);
});

test("Preview: renders inline code", () => {
  const { container } = render(<Preview text="Use `foo` here." />);
  assert.equal(container.querySelector("code")?.textContent, "foo");
});

test("Preview: empty text renders empty", () => {
  const { container } = render(<Preview text="" />);
  assert.equal(container.children.length, 1);
  assert.equal(container.firstElementChild?.children.length, 0);
});

test("Preview: a link to a real component becomes a typed reference with a dot; other links stay plain", () => {
  const { container } = render(
    <Preview
      text={
        "See [table](table), an [external](https://example.com) site, and [dropdown](dropdown-select)."
      }
    />,
  );
  const links = Array.from(container.querySelectorAll("a"));

  const tableLink = links.find((a) => a.textContent?.includes("table"))!;
  assert.equal(tableLink.getAttribute("data-node-type"), "component");
  assert.equal(tableLink.getAttribute("data-ref"), "table");
  assert.equal(tableLink.getAttribute("href"), "table");
  // author's label is preserved as the visible text
  assert.ok(tableLink.textContent!.includes("table"));
  // typed dot present, and the tooltip names the type in words (not color-only)
  assert.ok(tableLink.querySelector(".md-ref-dot"));
  assert.equal(tableLink.getAttribute("title"), "Component");

  // external URL: plain link, no typed treatment
  const extLink = links.find(
    (a) => a.getAttribute("href") === "https://example.com",
  )!;
  assert.equal(extLink.getAttribute("data-node-type"), null);
  assert.equal(extLink.querySelector(".md-ref-dot"), null);

  // unresolved slug (no such component node): plain link, honestly undressed
  const dropdownLink = links.find((a) => a.textContent?.includes("dropdown"))!;
  assert.equal(dropdownLink.getAttribute("data-node-type"), null);
  assert.equal(dropdownLink.querySelector(".md-ref-dot"), null);
});

test("an in-document anchor scrolls the preview instead of navigating the app", () => {
  // The hash is load-bearing now, so letting the default action run would set
  // location.hash and take the whole app to the home screen, unmounting the
  // file being edited. Swallowing it outright was the first fix, and it removed
  // the scroll, which is the behaviour the link is FOR.
  const { container } = render(
    <Preview text={"## Radio button\n\nSee [radio](#radio-button).\n"} />,
  );
  const link = container.querySelector('a[href="#radio-button"]');
  assert.ok(link, "the anchor rendered");
  // rehype-slug put the id on the heading itself, which is what the browser
  // would scroll to; stub there rather than on a duplicate id.
  const heading = document.getElementById("radio-button");
  assert.ok(heading, "rehype-slug gave the heading an id");
  let scrolled = false;
  (heading as HTMLElement).scrollIntoView = () => {
    scrolled = true;
  };
  // Assert on defaultPrevented rather than on location.hash: happy-dom does
  // not perform fragment navigation on click, so a hash comparison passes
  // whether or not the default action was actually stopped. It was, and
  // deleting the preventDefault left the test green until this changed.
  // Read defaultPrevented from a listener on the document, which is above
  // React's root container and so runs after React's handler.
  let prevented = false;
  const spy = (e: Event) => {
    prevented = e.defaultPrevented;
  };
  document.addEventListener("click", spy);
  fireEvent.click(link as Element);
  document.removeEventListener("click", spy);
  assert.equal(
    prevented,
    true,
    "the click was left to navigate the app away from the file",
  );
  assert.equal(scrolled, true, "the click did not scroll to the heading");
});
