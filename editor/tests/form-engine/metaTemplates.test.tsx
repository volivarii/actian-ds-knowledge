import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { RJSFSchema, ObjectFieldTemplateProps } from "@rjsf/utils";
import { RJSFForm } from "../../src/form-engine/RJSFForm";
import { MetaFieldTemplate } from "../../src/form-engine/templates/MetaFieldTemplate";
import { metaFormTemplates } from "../../src/form-engine/templates";

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

// Inline sentinel template — proves the `templates` prop reaches RJSF
// independently of the real MetaFieldTemplate/MetaObjectFieldTemplate.
function SentinelObjectTemplate(props: ObjectFieldTemplateProps) {
  return (
    <div data-testid="sentinel-template">
      {props.properties.map((p) => (
        <div key={p.name}>{p.content}</div>
      ))}
    </div>
  );
}

const miniSchema: RJSFSchema = {
  type: "object",
  properties: { component: { type: "string" } },
};

test("RJSFForm forwards a custom ObjectFieldTemplate to RJSF", () => {
  cleanup();
  const { container } = render(
    wrap(
      <RJSFForm
        schema={miniSchema}
        templates={{ ObjectFieldTemplate: SentinelObjectTemplate }}
        formData={{ component: "Buttons" }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(
    container.querySelector('[data-testid="sentinel-template"]'),
    "custom template rendered — templates prop is plumbed through",
  );
  cleanup();
});

function fieldProps(over: Record<string, unknown> = {}) {
  const merged = {
    id: "root_demo",
    label: "Demo field",
    children: <input id="root_demo" />,
    errors: null,
    help: null,
    hidden: false,
    required: false,
    displayLabel: true,
    rawDescription: "VERBOSE SCHEMA DESCRIPTION THAT MUST NOT RENDER",
    uiSchema: {},
    ...over,
  } as Record<string, any>;
  // RJSF resolves ui:help → rawHelp; mirror that for the fake props.
  if (merged.rawHelp === undefined && merged.uiSchema?.["ui:help"]) {
    merged.rawHelp = merged.uiSchema["ui:help"];
  }
  return merged as any;
}

test("MetaFieldTemplate never renders the schema description", () => {
  cleanup();
  const { queryByText, getByText } = render(
    wrap(<MetaFieldTemplate {...fieldProps()} />),
  );
  assert.ok(getByText("Demo field"), "label renders");
  assert.equal(
    queryByText(/VERBOSE SCHEMA DESCRIPTION/),
    null,
    "rawDescription suppressed",
  );
  cleanup();
});

test("MetaFieldTemplate renders ui:help inline by default, tooltip when flagged", () => {
  cleanup();
  // inline
  const inline = render(
    wrap(
      <MetaFieldTemplate
        {...fieldProps({ uiSchema: { "ui:help": "one-line help" } })}
      />,
    ),
  );
  assert.ok(inline.getByText("one-line help"), "inline help shows");
  cleanup();
  // tooltip — help text is NOT in always-visible DOM text; lives on the trigger's aria-label
  const tip = render(
    wrap(
      <MetaFieldTemplate
        {...fieldProps({
          uiSchema: {
            "ui:help": "tooltip help",
            "ui:options": { helpAsTooltip: true },
          },
        })}
      />,
    ),
  );
  assert.ok(
    tip.container.querySelector('[aria-label="tooltip help"]'),
    "tooltip trigger carries the help as aria-label",
  );
  assert.equal(
    tip.queryByText("tooltip help"),
    null,
    "tooltip help text not rendered inline when helpAsTooltip is true",
  );
  cleanup();
});

const groupSchema: RJSFSchema = {
  type: "object",
  properties: {
    component: { type: "string" },
    category: { type: "string" },
    section: { type: "string" },
    related: { type: "array", items: { type: "string" } },
    lastReviewed: { type: "string" },
    domains: { type: "object" },
  },
};

const groupUiOrder = {
  "ui:order": [
    "component",
    "category",
    "section",
    "related",
    "lastReviewed",
    "domains",
    "*",
  ],
};

test("root form groups into Identity/Relationships and omits domains", () => {
  cleanup();
  const { getByText, queryByText } = render(
    wrap(
      <RJSFForm
        schema={groupSchema}
        uiSchema={groupUiOrder}
        templates={metaFormTemplates}
        formData={{
          component: "Buttons",
          domains: { content: { status: "x" } },
        }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(getByText("Identity"), "Identity section header");
  assert.ok(getByText("Relationships"), "Relationships section header");
  assert.equal(
    queryByText(/domains/i),
    null,
    "no domains group label rendered",
  );
  cleanup();
});

test("domains omitted from render still round-trips through submit", () => {
  cleanup();
  const formData = {
    component: "Buttons",
    domains: { content: { status: "inherited" } },
  };
  let submitted: any = null;
  render(
    wrap(
      <RJSFForm
        schema={groupSchema}
        uiSchema={groupUiOrder}
        templates={metaFormTemplates}
        formData={formData}
        onChange={() => {}}
        onSubmit={(v) => {
          submitted = v;
        }}
      >
        <button type="submit">go</button>
      </RJSFForm>,
    ),
  );
  const form = document.querySelector("form");
  assert.ok(form, "form rendered");
  fireEvent.submit(form!);
  assert.deepEqual(
    submitted?.domains,
    { content: { status: "inherited" } },
    "domains preserved in submitted formData even though never rendered",
  );
  cleanup();
});
