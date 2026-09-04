// The top bar is a landmark, its title is not a heading, and the first thing
// a keyboard reaches is the way past the sidebar.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, fireEvent } from "@testing-library/react";
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
        mainPresent
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

test("the skip link moves focus to main without touching the address", () => {
  // The editor routes on the URL hash. A plain `href="#main"` fires
  // hashchange, the router reads `#main` as an address it never minted and
  // navigates HOME, so the way past the sidebar sent an author on an edit
  // screen back to the front door. The click is intercepted: focus moves,
  // the address stays.
  window.location.hash = "#/workspace/button";
  const { container } = render(
    <Theme>
      <AppHeader
        saveState={{ kind: "idle" }}
        batchCount={0}
        mainPresent
        onOpenStaging={() => {}}
        onOpenSettings={() => {}}
      />
      <main id="main" tabIndex={-1}>
        content
      </main>
    </Theme>,
  );
  // jsdom does not navigate on an anchor click, so "the hash is unchanged"
  // held with no preventDefault at all (proved by mutation). The event's own
  // cancelled flag is what the browser acts on, so that is what is asserted.
  const link = container.querySelector('a[href="#main"]')!;
  const click = new window.MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true, "the click would navigate the hash router");
  assert.equal(document.activeElement?.id, "main", "focus did not move to main");
  assert.equal(window.location.hash, "#/workspace/button", "the skip link changed the address");
});

test("no skip link when there is no main to skip to (signed out)", () => {
  const { container } = render(
    <Theme>
      <AppHeader
        saveState={{ kind: "idle" }}
        batchCount={0}
        mainPresent={false}
        onOpenStaging={() => {}}
        onOpenSettings={() => {}}
      />
    </Theme>,
  );
  // A boolean, not the node: `assert.equal(node, null)` diffs a live DOM node
  // on failure and SIGKILLs the runner, so a regression read as a hang.
  assert.equal(container.querySelector('a[href="#main"]') === null, true, "a skip link to nothing");
});

test("the header carries one polite live region", () => {
  const { container } = mountHeader();
  const regions = container.querySelectorAll('[aria-live="polite"]');
  assert.equal(regions.length, 1, `expected one live region, found ${regions.length}`);
});
