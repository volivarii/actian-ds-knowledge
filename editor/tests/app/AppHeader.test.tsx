// The top bar is a landmark, its title is not a heading, and the first thing
// a keyboard reaches is the way past the sidebar.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { AppHeader } from "../../src/app/AppHeader";

afterEach(cleanup);

function mountHeader() {
  return render(
    <Theme>
      <AppHeader
        saveState={{ kind: "idle" }}
        batchCount={0}
        onOpenStaging={() => {}}
        onOpenSettings={() => {}}
      />
    </Theme>,
  );
}

test("the top bar is a header landmark whose title is not a heading", () => {
  const { container } = mountHeader();
  const header = container.querySelector("header");
  assert.ok(header, "no <header> landmark");
  assert.equal(
    header.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
    0,
    "the app title is a heading; the page's own title is the h1",
  );
  assert.ok(/Actian DS Knowledge Editor/.test(header.textContent ?? ""));
});

test("the skip link is the first focusable thing and targets #main", () => {
  const { container } = mountHeader();
  const focusable = container.querySelector("a,button,input,[tabindex]");
  assert.ok(focusable, "nothing focusable");
  assert.equal(focusable.tagName, "A");
  assert.equal(focusable.getAttribute("href"), "#main");
  assert.match(focusable.textContent ?? "", /skip to content/i);
});

test("the header carries one polite live region", () => {
  const { container } = mountHeader();
  const regions = container.querySelectorAll('[aria-live="polite"]');
  assert.equal(regions.length, 1, `expected one live region, found ${regions.length}`);
});
