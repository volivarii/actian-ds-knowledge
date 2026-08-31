import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { RecipePanel } from "../../src/app/RecipePanel";
import type { PatternRecipe } from "../../src/lib/patternIndex";

afterEach(() => cleanup());

function recipe(over: Partial<PatternRecipe> = {}): PatternRecipe {
  return {
    slug: "a-capture",
    label: "A capture",
    apps: ["studio"],
    names: ["a-pattern"],
    surface: "Studio > Catalog",
    capturedOn: "2026-08-20",
    productVersion: "next.dev.zeenea.app/studio",
    description: null,
    when: null,
    tags: [],
    slots: [],
    renderNotes: [],
    skeleton: null,
    ...over,
  };
}

function show(r: PatternRecipe) {
  render(
    <Theme>
      <RecipePanel recipe={r} onClose={() => {}} />
    </Theme>,
  );
}

// toSkeletonOutline deliberately swallows every malformed shape rather than
// throwing, which is right. The panel must not then let the silence read as
// "this capture has no skeleton": the reader opened it BECAUSE it may be
// incomplete, and this file's siblings all report what they could not resolve
// rather than dropping it.

test("a capture with a skeleton nothing could be read from says so", () => {
  show(recipe({ skeleton: { content: { type: "FRAME" } } }));
  assert.ok(
    screen.getByText(/no nodes could be read/i),
    "an unreadable skeleton must not look like an absent one",
  );
});

test("a capture with no skeleton at all shows no skeleton section", () => {
  show(recipe({ skeleton: null }));
  assert.equal(screen.queryByText(/no nodes could be read/i), null);
  assert.equal(screen.queryByText(/nodes$/), null);
});

test("a capture with a readable skeleton reports its node count", () => {
  show(
    recipe({
      skeleton: { content: [{ type: "FRAME", name: "Root" }] },
    }),
  );
  assert.ok(screen.getByText(/1 nodes/));
  assert.equal(screen.queryByText(/no nodes could be read/i), null);
});

test("a capture missing its provenance says so rather than showing a blank", () => {
  show(recipe({ surface: null, capturedOn: null, productVersion: null }));
  assert.ok(screen.getByText(/No surface recorded/));
  assert.ok(screen.getByText(/No capture date recorded/));
});
