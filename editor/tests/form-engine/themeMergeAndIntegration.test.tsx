import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { RJSFSchema, ObjectFieldTemplateProps, IconButtonProps } from "@rjsf/utils";
import { RJSFForm } from "../../src/form-engine/RJSFForm";

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

const useCasesSchema: RJSFSchema = {
  type: "object",
  properties: {
    label: { type: "string", title: "App label" },
    useCases: {
      type: "array",
      title: "useCases",
      items: {
        type: "object",
        properties: {
          audience: { type: "array", title: "audience", items: { type: "string" } },
          jobs: { type: "array", title: "jobs", items: { type: "string" } },
        },
      },
    },
  },
};

const useCasesData = {
  label: "Administration",
  useCases: [{ audience: ["Administrator", "IT operations"], jobs: ["Configure connections"] }],
};

test("nested object-array renders with Radix controls and no Bootstrap markup", () => {
  cleanup();
  const { container, getAllByRole } = render(
    wrap(<RJSFForm schema={useCasesSchema} formData={useCasesData} onChange={() => {}} />),
  );
  assert.equal(container.querySelector(".glyphicon"), null, "no glyphicon icons");
  assert.equal(container.querySelector("input.form-control"), null, "no Bootstrap inputs");
  assert.ok(container.querySelector("input.rt-TextFieldInput"), "Radix inputs present");
  // audience (1) + jobs (1) + useCases (1) Add buttons, each labeled.
  assert.ok(getAllByRole("button", { name: /add/i }).length >= 3, "labeled Add buttons for each array");
  // Move/Remove controls exist for the nested string items.
  assert.ok(getAllByRole("button", { name: /remove/i }).length >= 3, "remove controls present");
  cleanup();
});

function SentinelObject(props: ObjectFieldTemplateProps) {
  return (
    <div data-testid="sentinel-object">
      {props.properties.map((p) => (
        <div key={p.name}>{p.content}</div>
      ))}
    </div>
  );
}

function SentinelRemove(_props: IconButtonProps) {
  return <button type="button" aria-label="Remove" data-testid="sentinel-remove" />;
}

const arraySchema: RJSFSchema = {
  type: "object",
  properties: { tags: { type: "array", title: "Tags", items: { type: "string" } } },
};

test("per-form ObjectFieldTemplate override wins while array controls stay Radix", () => {
  cleanup();
  const { container } = render(
    wrap(
      <RJSFForm
        schema={arraySchema}
        templates={{ ObjectFieldTemplate: SentinelObject }}
        formData={{ tags: ["a"] }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(container.querySelector('[data-testid="sentinel-object"]'), "object override applied");
  assert.equal(container.querySelector(".glyphicon"), null, "array controls still Radix (no glyphicon)");
  cleanup();
});

test("per-form ButtonTemplates override is deep-merged (Remove overridden, Move stays Radix)", () => {
  cleanup();
  const { container, getAllByRole } = render(
    wrap(
      <RJSFForm
        schema={arraySchema}
        templates={{ ButtonTemplates: { RemoveButton: SentinelRemove } }}
        formData={{ tags: ["a", "b"] }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(container.querySelector('[data-testid="sentinel-remove"]'), "RemoveButton override applied");
  assert.ok(getAllByRole("button", { name: /move up/i }).length >= 1, "MoveUp still rendered from Radix base");
  cleanup();
});
