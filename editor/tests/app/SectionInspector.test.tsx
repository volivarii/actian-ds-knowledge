import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { SectionInspector } from "../../src/app/SectionInspector";
import type { OutgoingConnection } from "../../src/substrate";
import { buildGraphIndex } from "../../src/substrate/graphIndex";
import type { Taxonomy } from "../../src/substrate";

afterEach(cleanup);

const fakeTaxonomy = {
  getSlugs: () => [],
  getTitle: (_d: string, slug: string) =>
    ({ "color-contrast": "Color contrast", typography: "Typography" })[slug] ??
    null,
  getBody: () => null,
  getTier: () => null,
  domainOfSlug: () => "accessibility" as const,
  searchSections: () => [],
};

const sampleOutgoing: OutgoingConnection[] = [
  {
    slug: "color-contrast",
    refType: "a11y_refs",
    note: "preserves contrast",
    domain: "accessibility",
  },
  {
    slug: "typography",
    refType: "a11y_refs",
    note: null,
    domain: "accessibility",
  },
];

function renderInspector(props: {
  outgoing: OutgoingConnection[];
  incoming?: never[];
  scope?: "file" | "section";
}) {
  return render(
    <Theme>
      <SectionInspector
        sectionTitle="§3.1 Color Usage Rules"
        outgoing={props.outgoing}
        incoming={[]}
        taxonomy={fakeTaxonomy}
        scope={props.scope ?? "file"}
        onAddConnection={() => {}}
        onRemoveConnection={() => {}}
        onRepointConnection={() => {}}
      />
    </Theme>,
  );
}

test("SectionInspector: shows section title", () => {
  renderInspector({ outgoing: sampleOutgoing });
  assert.ok(screen.getByText("§3.1 Color Usage Rules"));
});

test("SectionInspector: lists outgoing connections by topic title (not slug)", () => {
  renderInspector({ outgoing: sampleOutgoing });
  assert.ok(screen.getByText("Color contrast"));
  assert.ok(screen.getByText("Typography"));
});

test("SectionInspector: renders the note when present", () => {
  renderInspector({ outgoing: sampleOutgoing });
  assert.ok(screen.getByText(/preserves contrast/));
});

test("SectionInspector: shows 'Connected topics (N)' heading with count", () => {
  renderInspector({ outgoing: sampleOutgoing });
  assert.ok(screen.getByText(/Connected topics \(2\)/));
});

test("SectionInspector: empty outgoing list shows guidance", () => {
  renderInspector({ outgoing: [] });
  assert.ok(screen.getByText(/this file has no connections yet/i));
});

test("SectionInspector: shows file-level scope caption", () => {
  renderInspector({ outgoing: sampleOutgoing });
  assert.ok(screen.getByText(/these connections apply to the whole file/i));
});

test("SectionInspector: 'Connect to another topic' button present in file scope", () => {
  renderInspector({ outgoing: sampleOutgoing });
  assert.ok(screen.getByRole("button", { name: /connect to another topic/i }));
});

test("SectionInspector: section scope hides outgoing + Connect button", () => {
  renderInspector({ outgoing: sampleOutgoing, scope: "section" });
  // Outgoing connections shouldn't render in section scope.
  assert.equal(screen.queryByText("Color contrast"), null);
  assert.equal(screen.queryByText("Typography"), null);
  // The "Connected topics (N)" header is suppressed too.
  assert.equal(screen.queryByText(/Connected topics/), null);
  // No + Connect affordance.
  assert.equal(
    screen.queryByRole("button", { name: /connect to another topic/i }),
    null,
  );
  // A guidance message explains where to add a connection.
  assert.ok(screen.getByText(/connections live at the file level/i));
});

const graphIndex = buildGraphIndex({
  nodes: [
    { id: "component:button", type: "component", title: "Button" },
    { id: "content:loading", type: "content_topic", title: "Loading states" },
  ],
  edges: [
    {
      source: "content:loading",
      target: "component:button",
      type: "related",
      note: null,
    },
  ],
});
const graphTaxonomy = {
  getTitle: () => null,
  domainOfSlug: () => null,
} as unknown as Taxonomy;

function baseGraphProps() {
  return {
    sectionTitle: "Button",
    outgoing: [],
    incoming: [
      { file: "some/anchor/ref.md", refType: "a11y_refs" as const, note: null },
    ],
    taxonomy: graphTaxonomy,
    scope: "file" as const,
    onAddConnection: () => {},
    onRemoveConnection: () => {},
    onRepointConnection: () => {},
  };
}

test("graph-node file: shows typed referenced-by titles, not anchor file paths", () => {
  const { getByText, queryByText } = render(
    <Theme>
      <SectionInspector
        {...baseGraphProps()}
        nodeId="component:button"
        graphIndex={graphIndex}
      />
    </Theme>,
  );
  getByText("Loading states");
  assert.equal(queryByText(/some\/anchor\/ref\.md/), null);
  cleanup();
});

test("non-graph file (nodeId null): falls back to the anchor incoming list", () => {
  const { getByText } = render(
    <Theme>
      <SectionInspector
        {...baseGraphProps()}
        nodeId={null}
        graphIndex={graphIndex}
      />
    </Theme>,
  );
  getByText(/some\/anchor\/ref\.md/);
  cleanup();
});
