import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { TopicPicker } from "../../src/app/TopicPicker";
import type { Taxonomy, SearchResult } from "../../src/substrate";

afterEach(cleanup);

function fakeTaxonomy(results: SearchResult[]): Taxonomy {
  return {
    getSlugs: () => [],
    getTitle: () => null,
    getBody: () => null,
    getTier: () => null,
    domainOfSlug: () => null,
    searchSections: (q) =>
      q.length
        ? results.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()))
        : [],
  };
}

const SAMPLE_RESULTS: SearchResult[] = [
  {
    slug: "color-contrast",
    domain: "accessibility",
    title: "Color contrast",
    body: "WCAG 1.4.3 — 4.5:1 body / 3:1 large.",
    tier: null,
  },
  {
    slug: "state-transitions",
    domain: "motion",
    title: "State transitions",
    body: "100-200ms band.",
    tier: null,
  },
];

test("TopicPicker: input label says 'Find a topic'", () => {
  render(
    <Theme>
      <TopicPicker
        taxonomy={fakeTaxonomy(SAMPLE_RESULTS)}
        onPick={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  assert.ok(screen.getByPlaceholderText(/find a topic/i));
});

test("TopicPicker: typing surfaces matching results by title", () => {
  render(
    <Theme>
      <TopicPicker
        taxonomy={fakeTaxonomy(SAMPLE_RESULTS)}
        onPick={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  const input = screen.getByPlaceholderText(
    /find a topic/i,
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "color" } });
  assert.ok(screen.getByText("Color contrast"));
  assert.equal(screen.queryByText("State transitions"), null);
});

test("TopicPicker: clicking a result calls onPick with full payload", () => {
  const picked: {
    value: { slug: string; domain: string; note: string | null } | null;
  } = { value: null };
  render(
    <Theme>
      <TopicPicker
        taxonomy={fakeTaxonomy(SAMPLE_RESULTS)}
        onPick={(r) => {
          picked.value = r;
        }}
        onCancel={() => {}}
      />
    </Theme>,
  );
  const input = screen.getByPlaceholderText(
    /find a topic/i,
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "color" } });
  fireEvent.click(screen.getByText("Color contrast"));
  fireEvent.click(screen.getByRole("button", { name: /connect/i }));
  assert.equal(picked.value?.slug, "color-contrast");
  assert.equal(picked.value?.domain, "accessibility");
});

test("TopicPicker: optional note input round-trips to onPick", () => {
  const picked: {
    value: { slug: string; domain: string; note: string | null } | null;
  } = { value: null };
  render(
    <Theme>
      <TopicPicker
        taxonomy={fakeTaxonomy(SAMPLE_RESULTS)}
        onPick={(r) => {
          picked.value = r;
        }}
        onCancel={() => {}}
      />
    </Theme>,
  );
  const search = screen.getByPlaceholderText(
    /find a topic/i,
  ) as HTMLInputElement;
  fireEvent.change(search, { target: { value: "color" } });
  fireEvent.click(screen.getByText("Color contrast"));
  const note = screen.getByPlaceholderText(
    /how this section connects/i,
  ) as HTMLInputElement;
  fireEvent.change(note, {
    target: { value: "preserves contrast under theming" },
  });
  fireEvent.click(screen.getByRole("button", { name: /connect/i }));
  assert.equal(picked.value?.note, "preserves contrast under theming");
});

test("TopicPicker: note input hidden for a flat-field (component) pick", () => {
  // relatedComponents (component/content domains) is a flat array that can't
  // store a per-entry note — the note input must not appear, otherwise an
  // author would type a note that is silently dropped on write.
  const results: SearchResult[] = [
    {
      slug: "badge",
      domain: "component",
      title: "Badge",
      body: null,
      tier: null,
    },
  ];
  render(
    <Theme>
      <TopicPicker
        taxonomy={fakeTaxonomy(results)}
        onPick={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  fireEvent.change(screen.getByPlaceholderText(/find a topic/i), {
    target: { value: "badge" },
  });
  fireEvent.click(screen.getByText("Badge"));
  assert.equal(
    screen.queryByPlaceholderText(/how this section connects/i),
    null,
    "note input must be hidden for a component (flat-field) pick",
  );
});

test("TopicPicker: note input shown for an object-ref (accessibility) pick", () => {
  render(
    <Theme>
      <TopicPicker
        taxonomy={fakeTaxonomy(SAMPLE_RESULTS)}
        onPick={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  fireEvent.change(screen.getByPlaceholderText(/find a topic/i), {
    target: { value: "color" },
  });
  fireEvent.click(screen.getByText("Color contrast"));
  assert.ok(
    screen.getByPlaceholderText(/how this section connects/i),
    "note input must be shown for an accessibility (object-ref) pick",
  );
});

test("TopicPicker: shows file context for each result", () => {
  const results: SearchResult[] = [
    {
      slug: "color-contrast",
      domain: "accessibility",
      title: "Color contrast",
      body: "WCAG 1.4.3 etc.",
      tier: null,
    },
  ];
  render(
    <Theme>
      <TopicPicker
        taxonomy={fakeTaxonomy(results)}
        onPick={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  fireEvent.change(screen.getByPlaceholderText(/find a topic/i), {
    target: { value: "color" },
  });
  assert.ok(screen.getByText(/accessibility/i));
});
