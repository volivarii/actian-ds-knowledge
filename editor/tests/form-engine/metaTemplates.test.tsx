import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { RJSFSchema, ObjectFieldTemplateProps } from "@rjsf/utils";
import { RJSFForm } from "../../src/form-engine/RJSFForm";
import { MetaFieldTemplate } from "../../src/form-engine/templates/MetaFieldTemplate";

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

// Inline sentinel template proves the `templates` prop reaches RJSF —
// no dependency on the real templates yet (those arrive in Tasks 2–3).
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
  return {
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
  } as any;
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
  cleanup();
});
