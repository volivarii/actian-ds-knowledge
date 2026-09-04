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
