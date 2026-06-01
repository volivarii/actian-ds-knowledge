import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { SectionInspector } from "../../src/app/SectionInspector";
import { TopicPicker } from "../../src/app/TopicPicker";
import { AddSectionDialog } from "../../src/app/AddSectionDialog";
import { DeleteSectionDialog } from "../../src/app/DeleteSectionDialog";
import { A11yRefsWidget } from "../../src/form-engine/widgets/A11yRefsWidget";
import type {
  OutgoingConnection,
  Taxonomy,
  SearchResult,
} from "../../src/substrate";

afterEach(cleanup);

const FORBIDDEN_TOKENS = [
  "slug",
  "ref:",
  "a11y_refs",
  "motion_refs",
  "frontmatter",
];

const fakeTaxonomy: Taxonomy = {
  getSlugs: () => [],
  getTitle: (_d, s) => ({ "color-contrast": "Color contrast" })[s] ?? null,
  getBody: () => null,
  getTier: () => null,
  domainOfSlug: () => "accessibility",
  searchSections: () => [
    {
      slug: "color-contrast",
      domain: "accessibility",
      title: "Color contrast",
      body: "WCAG 1.4.3",
      tier: null,
    } as SearchResult,
  ],
};

function gatherText(container: HTMLElement): string {
  return container.textContent ?? "";
}

test("doctrine: SectionInspector renders no forbidden vocabulary", () => {
  const outgoing: OutgoingConnection[] = [
    {
      slug: "color-contrast",
      refType: "a11y_refs",
      note: null,
      domain: "accessibility",
    },
  ];
  const { container } = render(
    <Theme>
      <SectionInspector
        sectionTitle="§3.1"
        outgoing={outgoing}
        incoming={[]}
        taxonomy={fakeTaxonomy}
        scope="file"
        onAddConnection={() => {}}
        onRemoveConnection={() => {}}
        onRepointConnection={() => {}}
      />
    </Theme>,
  );
  const text = gatherText(container).toLowerCase();
  for (const token of FORBIDDEN_TOKENS) {
    assert.equal(
      text.includes(token.toLowerCase()),
      false,
      `forbidden token "${token}" appeared in SectionInspector rendered text — author-facing UI must use "topic" / "connection" / "identifier"`,
    );
  }
});

test("doctrine: TopicPicker renders no forbidden vocabulary", () => {
  const { container } = render(
    <Theme>
      <TopicPicker
        taxonomy={fakeTaxonomy}
        onPick={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  const text = gatherText(container).toLowerCase();
  for (const token of FORBIDDEN_TOKENS) {
    assert.equal(
      text.includes(token.toLowerCase()),
      false,
      `forbidden token "${token}" appeared in TopicPicker rendered text — author-facing UI must use "topic" / "connection" / "identifier"`,
    );
  }
});

test("doctrine: SectionInspector does not leak frontmatter into body container (no shared classnames)", () => {
  const outgoing: OutgoingConnection[] = [
    {
      slug: "color-contrast",
      refType: "a11y_refs",
      note: "guarded test",
      domain: "accessibility",
    },
  ];
  const { container } = render(
    <Theme>
      <SectionInspector
        sectionTitle="§3.1"
        outgoing={outgoing}
        incoming={[]}
        taxonomy={fakeTaxonomy}
        scope="file"
        onAddConnection={() => {}}
        onRemoveConnection={() => {}}
        onRepointConnection={() => {}}
      />
    </Theme>,
  );
  const leaks = container.querySelectorAll("[data-connection], [data-ref]");
  assert.equal(
    leaks.length,
    0,
    "Section Inspector must not stamp inline connection metadata onto rendered DOM",
  );
});

// Extended forbidden list — includes file-path tokens which are off-limits
// outside elements explicitly marked `data-detail="path"` (the doctrine
// escape hatch for showing concrete .md / _order.json paths to power users).
const DIALOG_FORBIDDEN_TOKENS = [
  "slug",
  "ref:",
  "a11y_refs",
  "motion_refs",
  "frontmatter",
  "_order.json",
  ".md",
];

// Pluck out any element marked `data-detail="path"` from the rendered
// portal content before scanning — these are the allowed exceptions.
// Dialogs render into a portal under document.body — scan the body, not the
// test container. Clones first to avoid mutating the live DOM.
function gatherTextExcludingPathDetails(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  for (const node of Array.from(
    clone.querySelectorAll('[data-detail="path"]'),
  )) {
    node.remove();
  }
  return clone.textContent ?? "";
}

test("doctrine: AddSectionDialog renders no forbidden vocabulary outside data-detail elements", () => {
  render(
    <Theme>
      <AddSectionDialog
        open
        domain="foundations"
        pathPrefix="foundations/src"
        existingSlugs={[]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  const text = gatherTextExcludingPathDetails().toLowerCase();
  for (const token of DIALOG_FORBIDDEN_TOKENS) {
    assert.ok(
      !text.includes(token.toLowerCase()),
      `AddSectionDialog UI must not include "${token}" outside data-detail elements`,
    );
  }
});

test("doctrine: DeleteSectionDialog (refCount=0) renders no forbidden vocabulary outside data-detail elements", () => {
  render(
    <Theme>
      <DeleteSectionDialog
        open
        slug="tokens"
        title="Tokens"
        domain="foundations"
        refCount={0}
        sampleRefs={[]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  const text = gatherTextExcludingPathDetails().toLowerCase();
  for (const token of DIALOG_FORBIDDEN_TOKENS) {
    assert.ok(
      !text.includes(token.toLowerCase()),
      `DeleteSectionDialog (no refs) UI must not include "${token}" outside data-detail elements`,
    );
  }
});

test("doctrine: DeleteSectionDialog (refCount>=1) renders no forbidden vocabulary outside data-detail elements (sample refs allowed inside)", () => {
  render(
    <Theme>
      <DeleteSectionDialog
        open
        slug="tokens"
        title="Tokens"
        domain="foundations"
        refCount={3}
        sampleRefs={[
          "components/dist/guidelines/button.json",
          "foundations/src/design-guidelines.md",
        ]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </Theme>,
  );
  const text = gatherTextExcludingPathDetails().toLowerCase();
  for (const token of DIALOG_FORBIDDEN_TOKENS) {
    assert.ok(
      !text.includes(token.toLowerCase()),
      `DeleteSectionDialog (with refs) UI must not include "${token}" outside data-detail elements`,
    );
  }
});

test("doctrine: A11yRefsWidget shows titles not slugs, and exposes no forbidden vocabulary", () => {
  const widgetProps = {
    value: [{ ref: "buttons" }],
    onChange: () => {},
    disabled: false,
    readonly: false,
    id: "a11y_refs",
    formContext: {},
  } as any;
  render(
    <Theme>
      <A11yRefsWidget {...widgetProps} />
    </Theme>,
  );
  // Title must be present
  assert.ok(
    screen.queryByText("Buttons"),
    'A11yRefsWidget must show the human title "Buttons" for slug "buttons"',
  );
  // Raw slug must not be present as visible text
  assert.equal(
    screen.queryByText("buttons"),
    null,
    'A11yRefsWidget must not expose the raw slug "buttons" as visible text',
  );
  // Vocabulary words "slug" and "ref" must not appear in rendered output
  const { container } = render(
    <Theme>
      <A11yRefsWidget {...widgetProps} />
    </Theme>,
  );
  const text = (container.textContent ?? "").toLowerCase();
  assert.equal(
    text.includes("slug"),
    false,
    'A11yRefsWidget must not expose the vocabulary word "slug" as visible text',
  );
  assert.equal(
    text.includes("ref"),
    false,
    'A11yRefsWidget must not expose the vocabulary word "ref" as visible text',
  );
  cleanup();
});
