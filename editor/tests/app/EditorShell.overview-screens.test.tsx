// The four "Explore the data" tabs became screens. What has to hold is that
// the shell dispatches each overview's activePath to the right view: while
// they were tabs, reaching the health view meant landing on home and clicking,
// so a deep link to it did not exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { EditorShell } from "../../src/app/EditorShell";
import { hashFor, pathFromHash } from "../../src/lib/routes";
import { COMPONENT_PARENT } from "../../src/app/scopes";
import { A11Y_SCREEN_TITLE } from "../../src/app/A11yCoverageView";

// A minimal Octokit stub. The health view's data is baked, not fetched.
const octokit = {} as never;

test("the shell renders the health screen at its own address", () => {
  const { getByText } = render(
    <Theme>
      <EditorShell
        octokit={octokit}
        activePath="health"
        setActivePath={() => {}}
      />
    </Theme>,
  );
  getByText(/Substrate relationship health/i); // GraphHealthTab intro copy
  cleanup();
});

test("the health screen is deep linkable, which it was not as a tab", () => {
  assert.equal(hashFor("health"), "#/health");
  assert.equal(pathFromHash("#/health"), "health");
});

test("home no longer renders an overview it also links to", () => {
  const { queryAllByRole, queryByText } = render(
    <Theme>
      <EditorShell
        octokit={octokit}
        activePath={null}
        setActivePath={() => {}}
      />
    </Theme>,
  );
  assert.equal(queryAllByRole("tab").length, 0);
  assert.equal(queryByText(/Substrate relationship health/i), null);
  cleanup();
});

test("every overview screen owns exactly one h1 while it is still loading", () => {
  // These four rendered INSIDE the home screen, under home's h1, so they each
  // started at h3. Promoting them to screens without shifting the outline left
  // four pages with no h1 at all and a heading level skipped from the start.
  // Found by reading the markup after the promotion, not by any existing test.
  //
  // The stub never resolves, so this covers the WAITING state, which is the
  // one the defect lived in. The loaded state is asserted where a fixture
  // actually serves data: see coverageMeters.test.tsx.
  for (const path of ["coverage", "accessibility", "patterns", "health"]) {
    const { container, unmount } = render(
      <Theme>
        <EditorShell
          octokit={octokit}
          activePath={path}
          setActivePath={() => {}}
        />
      </Theme>,
    );
    const h1s = container.querySelectorAll("h1");
    assert.equal(
      h1s.length,
      1,
      `${path} has ${h1s.length} h1s: ${[...h1s].map((h) => h.textContent).join(" | ")}`,
    );
    // And nothing skips a level down from it.
    assert.equal(
      container.querySelectorAll("h3, h4, h5, h6").length,
      0,
      `${path} skips from h1 past h2`,
    );
    unmount();
  }
  cleanup();
});

test("a component's parent is one fact, so its label and its address agree", () => {
  // The workspace read "Back to coverage" while calling setActivePath(null),
  // which was true only for as long as home WAS the coverage dashboard. Two
  // independent strings is the defect; this asserts they are now one.
  assert.equal(
    pathFromHash(hashFor(COMPONENT_PARENT.path)),
    COMPONENT_PARENT.path,
    "the parent address does not resolve to a screen",
  );
  // Deliberately NOT asserting label.toLowerCase() === path. That happens to
  // hold today and is not the invariant: renaming the screen to "Component
  // coverage" would fail a guard while breaking nothing. The invariant is that
  // both the words and the address come from this one object, which is
  // structural, and that the address resolves, which is asserted above.
  assert.ok(
    COMPONENT_PARENT.label.length > 0,
    "the workspace has no words to render",
  );
});

test("a screen keeps its name across the fetch that fills it", () => {
  // The accessibility screen was called "Accessibility" while loading and
  // "Accessibility coverage" once the data landed, so the page renamed itself
  // under the reader the moment the fetch resolved.
  const { container } = render(
    <Theme>
      <EditorShell
        octokit={octokit}
        activePath="accessibility"
        setActivePath={() => {}}
      />
    </Theme>,
  );
  assert.equal(
    container.querySelector("h1")?.textContent,
    A11Y_SCREEN_TITLE,
    "the waiting state uses a different name than the loaded one",
  );
  cleanup();
});
