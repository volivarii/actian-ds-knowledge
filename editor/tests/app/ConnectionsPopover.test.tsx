// Wiring tests for the Section Inspector + Topic Picker write-back path
// (Editor Tier 2 v1.2). The popover holds the picker UI; picking / removing
// / repointing a connection must call onTextChange with the mutated source
// so MarkdownEditScreen can dispatch it through the CodeMirror view.
//
// Tests target ConnectionsPopover in isolation: a fake taxonomy + a
// stubbed onTextChange capture the write-back signal without spinning up
// CodeMirror or the full editor screen.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { ConnectionsPopover } from "../../src/app/ConnectionsPopover";
import type {
  OutgoingConnection,
  Taxonomy,
  SearchResult,
} from "../../src/substrate";

afterEach(cleanup);

function fakeTaxonomy(results: SearchResult[]): Taxonomy {
  return {
    getSlugs: () => [],
    getTitle: (_d, slug) => {
      const hit = results.find((r) => r.slug === slug);
      return hit ? hit.title : null;
    },
    getBody: () => null,
    getTier: () => null,
    domainOfSlug: () => null,
    searchSections: (q) =>
      q.length
        ? results.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()))
        : results,
  };
}

const TYPOGRAPHY: SearchResult = {
  slug: "typography",
  domain: "accessibility",
  title: "Typography",
  body: "WCAG 1.4.12 — text spacing.",
  tier: null,
};

const COLOR_CONTRAST: SearchResult = {
  slug: "color-contrast",
  domain: "accessibility",
  title: "Color contrast",
  body: "WCAG 1.4.3 — 4.5:1 body / 3:1 large.",
  tier: null,
};

const STATE_TRANSITIONS: SearchResult = {
  slug: "state-transitions",
  domain: "motion",
  title: "State transitions",
  body: "100-200ms band.",
  tier: null,
};

const SOURCE_WITH_OUTGOING = `---
a11y_refs:
  - { ref: color-contrast }
---

## 1. Section

Body.
`;

const EMPTY_SOURCE = `## 1. Section

Body.
`;

function renderPopover(args: {
  text: string;
  outgoing: OutgoingConnection[];
  results: SearchResult[];
  onTextChange?: (next: string) => void;
}) {
  const onTextChange = args.onTextChange ?? (() => {});
  render(
    <Theme>
      <ConnectionsPopover
        sectionTitle="Section"
        text={args.text}
        outgoing={args.outgoing}
        incoming={[]}
        broken={[]}
        taxonomy={fakeTaxonomy(args.results)}
        onTextChange={onTextChange}
        onClose={() => {}}
        anchorEl={null}
        scope="file"
      />
    </Theme>,
  );
}

test("ConnectionsPopover: onPick writes the new ref into frontmatter", () => {
  let captured: string | null = null;
  renderPopover({
    text: EMPTY_SOURCE,
    outgoing: [],
    results: [COLOR_CONTRAST],
    onTextChange: (next) => {
      captured = next;
    },
  });

  fireEvent.click(
    screen.getByRole("button", { name: /\+ Connect to another topic/i }),
  );
  fireEvent.change(screen.getByPlaceholderText(/find a topic/i), {
    target: { value: "color" },
  });
  fireEvent.click(screen.getByText("Color contrast"));
  fireEvent.click(screen.getByRole("button", { name: /^connect/i }));

  assert.ok(captured, "onTextChange should fire on pick");
  assert.match(captured!, /a11y_refs:/);
  assert.match(captured!, /ref: color-contrast/);
});

test("ConnectionsPopover: onPick maps motion domain to motion_refs", () => {
  let captured: string | null = null;
  renderPopover({
    text: EMPTY_SOURCE,
    outgoing: [],
    results: [STATE_TRANSITIONS],
    onTextChange: (next) => {
      captured = next;
    },
  });

  fireEvent.click(
    screen.getByRole("button", { name: /\+ Connect to another topic/i }),
  );
  fireEvent.change(screen.getByPlaceholderText(/find a topic/i), {
    target: { value: "state" },
  });
  fireEvent.click(screen.getByText("State transitions"));
  fireEvent.click(screen.getByRole("button", { name: /^connect/i }));

  assert.ok(captured);
  assert.match(captured!, /motion_refs:/);
  assert.match(captured!, /ref: state-transitions/);
});

test("ConnectionsPopover: disconnect removes the entry from frontmatter", () => {
  let captured: string | null = null;
  const outgoing: OutgoingConnection[] = [
    {
      slug: "color-contrast",
      refType: "a11y_refs",
      note: null,
      domain: "accessibility",
    },
  ];
  renderPopover({
    text: SOURCE_WITH_OUTGOING,
    outgoing,
    results: [COLOR_CONTRAST],
    onTextChange: (next) => {
      captured = next;
    },
  });

  fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));

  assert.ok(captured, "onTextChange should fire on disconnect");
  assert.doesNotMatch(captured!, /ref: color-contrast/);
});

test("ConnectionsPopover: repoint performs atomic swap on pick", () => {
  const calls: string[] = [];
  const outgoing: OutgoingConnection[] = [
    {
      slug: "color-contrast",
      refType: "a11y_refs",
      note: null,
      domain: "accessibility",
    },
  ];
  // Render the popover directly into "picker" mode by simulating the
  // sequence: click disconnect is wrong; instead exercise the broken-row
  // repoint affordance. Easiest path: use a broken ref so the BrokenRow
  // shows up with Repoint.
  render(
    <Theme>
      <ConnectionsPopover
        sectionTitle="Section"
        text={SOURCE_WITH_OUTGOING}
        outgoing={outgoing}
        incoming={[]}
        broken={[
          {
            file: "x.md",
            refType: "a11y_refs",
            slug: "color-contrast",
            note: null,
          },
        ]}
        taxonomy={fakeTaxonomy([TYPOGRAPHY])}
        onTextChange={(next) => calls.push(next)}
        onClose={() => {}}
        anchorEl={null}
        scope="file"
      />
    </Theme>,
  );

  fireEvent.click(screen.getByRole("button", { name: /repoint/i }));
  fireEvent.change(screen.getByPlaceholderText(/find a topic/i), {
    target: { value: "typo" },
  });
  fireEvent.click(screen.getByText("Typography"));
  fireEvent.click(screen.getByRole("button", { name: /^connect/i }));

  assert.equal(
    calls.length,
    1,
    "repoint should fire onTextChange exactly once",
  );
  assert.doesNotMatch(calls[0]!, /ref: color-contrast/);
  assert.match(calls[0]!, /ref: typography/);
});

// Step 3 — foundations_refs picker on category files
const TOKENS_TOPIC: SearchResult = {
  slug: "tokens",
  domain: "foundations",
  title: "Tokens",
  body: null,
  tier: null,
};

test("ConnectionsPopover: picking a foundations result on a category file writes foundations_refs", () => {
  let captured: string | null = null;
  render(
    <Theme>
      <ConnectionsPopover
        sectionTitle="Section"
        text={EMPTY_SOURCE}
        outgoing={[]}
        incoming={[]}
        broken={[]}
        taxonomy={fakeTaxonomy([TOKENS_TOPIC])}
        onTextChange={(next) => {
          captured = next;
        }}
        onClose={() => {}}
        anchorEl={null}
        scope="file"
        filePath="components/src/categories/action.md"
      />
    </Theme>,
  );

  fireEvent.click(
    screen.getByRole("button", { name: /\+ Connect to another topic/i }),
  );
  fireEvent.change(screen.getByPlaceholderText(/find a topic/i), {
    target: { value: "tokens" },
  });
  fireEvent.click(screen.getByText("Tokens"));
  fireEvent.click(screen.getByRole("button", { name: /^connect/i }));

  assert.ok(captured, "onTextChange should fire on pick");
  assert.match(captured!, /foundations_refs:/);
  assert.match(captured!, /ref: tokens/);
});

test("ConnectionsPopover: cancelling repoint leaves source untouched", () => {
  const calls: string[] = [];
  render(
    <Theme>
      <ConnectionsPopover
        sectionTitle="Section"
        text={SOURCE_WITH_OUTGOING}
        outgoing={[]}
        incoming={[]}
        broken={[
          {
            file: "x.md",
            refType: "a11y_refs",
            slug: "color-contrast",
            note: null,
          },
        ]}
        taxonomy={fakeTaxonomy([TYPOGRAPHY])}
        onTextChange={(next) => calls.push(next)}
        onClose={() => {}}
        anchorEl={null}
        scope="file"
      />
    </Theme>,
  );

  fireEvent.click(screen.getByRole("button", { name: /repoint/i }));
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

  assert.equal(calls.length, 0, "cancel should not write back");
});

// Step 5 — relatedComponents picker on content files
const BADGE_COMPONENT: SearchResult = {
  slug: "badge",
  domain: "component" as import("../../src/substrate").Domain,
  title: "Badge",
  body: null,
  tier: null,
};

test("ConnectionsPopover: picking a component on a content file writes relatedComponents flat array", () => {
  let captured: string | null = null;
  render(
    <Theme>
      <ConnectionsPopover
        sectionTitle="Section"
        text={EMPTY_SOURCE}
        outgoing={[]}
        incoming={[]}
        broken={[]}
        taxonomy={fakeTaxonomy([BADGE_COMPONENT])}
        onTextChange={(next) => {
          captured = next;
        }}
        onClose={() => {}}
        anchorEl={null}
        scope="file"
        filePath="content/src/patterns/forms.md"
      />
    </Theme>,
  );

  fireEvent.click(
    screen.getByRole("button", { name: /\+ Connect to another topic/i }),
  );
  fireEvent.change(screen.getByPlaceholderText(/find a topic/i), {
    target: { value: "badge" },
  });
  fireEvent.click(screen.getByText("Badge"));
  fireEvent.click(screen.getByRole("button", { name: /^connect/i }));

  assert.ok(captured, "onTextChange should fire on pick");
  assert.match(captured!, /relatedComponents: \[badge\]/);
  assert.doesNotMatch(captured!, /ref: badge/);
});
