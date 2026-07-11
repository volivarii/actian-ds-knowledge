import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import type { RJSFSchema } from "@rjsf/utils";
import { RJSFForm } from "../../src/form-engine/RJSFForm";
import { frontmatterTemplates } from "../../src/form-engine/templates";

// Schema shapes mirror the real category-defaults synced fields:
// anatomy[] {name, description}, variants[] {axis, values[]}, confidence{}.
const schema: RJSFSchema = {
  type: "object",
  properties: {
    label: { type: "string", title: "Category label" },
    anatomy: {
      type: "array",
      title: "Anatomy",
      items: {
        type: "object",
        properties: {
          name: { type: "string", title: "Name" },
          description: { type: "string", title: "Description" },
        },
      },
    },
    variants: {
      type: "array",
      title: "Variants",
      items: {
        type: "object",
        properties: {
          axis: { type: "string", title: "Axis" },
          values: { type: "array", items: { type: "string" }, title: "Values" },
        },
      },
    },
    confidence: {
      type: "object",
      title: "Confidence",
      properties: {
        a11y: {
          type: "string",
          enum: ["low", "medium", "high"],
          title: "A11y",
        },
      },
    },
  },
};

const uiSchema = {
  "ui:order": ["label", "anatomy", "variants", "confidence", "*"],
  "ui:options": {
    groups: [
      {
        title: "Synced from Figma",
        fields: ["anatomy", "variants", "confidence"],
        collapsed: true,
        note: "Sourced from Figma — not edited here.",
      },
    ],
  },
  anatomy: { "ui:disabled": true },
  variants: { "ui:disabled": true },
  confidence: { "ui:disabled": true },
};

const FORM_DATA = {
  label: "Action",
  anatomy: [{ name: "Container", description: "the surface" }],
  variants: [{ axis: "Style", values: ["primary", "ghost"] }],
  confidence: { a11y: "high" },
};

function renderForm(onSubmit: (data: unknown) => void = () => {}) {
  return render(
    <Theme>
      <RJSFForm
        schema={schema}
        uiSchema={uiSchema}
        templates={frontmatterTemplates}
        formData={FORM_DATA}
        onChange={() => {}}
        onSubmit={onSubmit}
      />
    </Theme>,
  );
}

test("synced fields collapse into a closed 'Synced from Figma' section", () => {
  cleanup();
  const { container } = renderForm();
  const details = container.querySelector("details");
  assert.ok(details, "renders a <details> disclosure for synced fields");
  assert.equal(details!.hasAttribute("open"), false, "starts collapsed");

  const summary = screen.getByText("Synced from Figma").closest("summary");
  assert.ok(summary, "title sits in the <summary>");
  assert.ok(details!.contains(summary), "summary belongs to the details");
  assert.ok(
    screen.getByText("Sourced from Figma — not edited here."),
    "renders the synced note",
  );
  cleanup();
});

test("editable fields lead; synced fields are tucked inside the section", () => {
  cleanup();
  const { container } = renderForm();
  const details = container.querySelector("details")!;

  const labelNode = screen.getByText("Category label");
  assert.equal(
    details.contains(labelNode),
    false,
    "editable label leads, outside the synced section",
  );

  const anatomyTitle = screen
    .getAllByText("Anatomy")
    .find((n) => details.contains(n));
  assert.ok(anatomyTitle, "anatomy is inside the synced section");
  cleanup();
});

test("every control in the synced section is disabled (greyed-out)", () => {
  cleanup();
  const { container } = renderForm();
  const details = container.querySelector("details")!;
  const controls = Array.from(
    details.querySelectorAll("input, select, textarea, button"),
  ) as Array<HTMLInputElement | HTMLButtonElement>;
  assert.ok(controls.length > 0, "synced section has controls to lock");
  for (const c of controls) {
    assert.equal(c.disabled, true, `control <${c.tagName}> is disabled`);
  }
  // And nothing in the synced section is merely read-only-but-typeable.
  const typeable = Array.from(
    details.querySelectorAll("input, textarea"),
  ) as HTMLInputElement[];
  for (const t of typeable) {
    assert.equal(t.disabled, true, "no enabled text field leaks through");
  }
  cleanup();
});

test("an expanded (non-collapsed) group renders a labeled section, not a disclosure", () => {
  cleanup();
  const expandedUi = {
    "ui:order": ["label", "anatomy", "variants", "confidence", "*"],
    "ui:options": {
      groups: [
        {
          title: "Figma facts",
          fields: ["anatomy", "variants", "confidence"],
          note: "Grouped but visible.",
        },
      ],
    },
  };
  const { container } = render(
    <Theme>
      <RJSFForm
        schema={schema}
        uiSchema={expandedUi}
        templates={frontmatterTemplates}
        formData={FORM_DATA}
        onChange={() => {}}
        onSubmit={() => {}}
      />
    </Theme>,
  );
  assert.equal(
    container.querySelector("details"),
    null,
    "no disclosure for an expanded group",
  );
  assert.ok(screen.getByText("Figma facts"), "group label renders");
  assert.ok(screen.getByText("Grouped but visible."), "group note renders");
  assert.ok(screen.getAllByText("Anatomy").length > 0);
  cleanup();
});

test("field descriptions render as an info glyph, not an inline paragraph", () => {
  cleanup();
  const describedSchema: RJSFSchema = {
    type: "object",
    properties: {
      label: {
        type: "string",
        title: "Category label",
        description: "The human name authors see.",
      },
    },
  };
  const { container } = render(
    <Theme>
      <RJSFForm
        schema={describedSchema}
        uiSchema={{}}
        templates={frontmatterTemplates}
        formData={{ label: "Action" }}
        onChange={() => {}}
        onSubmit={() => {}}
      />
    </Theme>,
  );
  const glyph = container.querySelector('[data-testid="field-description"]');
  assert.ok(glyph, "info glyph renders for the description");
  assert.equal(glyph!.getAttribute("tabindex"), "0", "glyph is focusable");
  const inline = Array.from(container.querySelectorAll("div")).find(
    (d) =>
      d.textContent === "The human name authors see." &&
      !d.hasAttribute("aria-label"),
  );
  assert.equal(inline, undefined, "no inline description paragraph");
  cleanup();
});

test("ui:options.inlineDescription opts a field back into inline description", () => {
  cleanup();
  const describedSchema: RJSFSchema = {
    type: "object",
    properties: {
      label: {
        type: "string",
        title: "Category label",
        description: "Essential prompt.",
      },
    },
  };
  render(
    <Theme>
      <RJSFForm
        schema={describedSchema}
        uiSchema={{ label: { "ui:options": { inlineDescription: true } } }}
        templates={frontmatterTemplates}
        formData={{ label: "Action" }}
        onChange={() => {}}
        onSubmit={() => {}}
      />
    </Theme>,
  );
  assert.ok(screen.getByText("Essential prompt."), "inline description shows");
  cleanup();
});

test("disabled synced values still round-trip through submit (no data loss)", () => {
  cleanup();
  let submitted: any = null;
  const { container } = renderForm((data) => {
    submitted = data;
  });
  // Submit without touching anything — disabled fields must persist in formData.
  fireEvent.submit(container.querySelector("form")!);
  assert.ok(submitted, "onSubmit fired");
  assert.deepEqual(
    submitted.anatomy,
    FORM_DATA.anatomy,
    "anatomy survives submit",
  );
  assert.deepEqual(
    submitted.variants,
    FORM_DATA.variants,
    "variants survive submit",
  );
  assert.deepEqual(
    submitted.confidence,
    FORM_DATA.confidence,
    "confidence survives submit",
  );
  cleanup();
});
