import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { RJSFSchema, ObjectFieldTemplateProps } from "@rjsf/utils";
import { RJSFForm } from "../../src/form-engine/RJSFForm";

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
