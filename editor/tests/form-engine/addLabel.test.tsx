import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { RJSFSchema } from "@rjsf/utils";
import { RJSFForm } from "../../src/form-engine/RJSFForm";

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

// Minimal fixture mirroring the useCases array structure in appContextApp.
const schema: RJSFSchema = {
  type: "object",
  properties: {
    useCases: {
      type: "array",
      title: "Use cases",
      items: {
        type: "object",
        properties: {
          audience: {
            type: "array",
            title: "Audience",
            items: { type: "string" },
          },
          jobs: {
            type: "array",
            title: "Jobs",
            items: { type: "string" },
          },
        },
      },
    },
  },
};

const uiSchema = {
  useCases: {
    "ui:options": { addLabel: "use case" },
    items: {
      audience: { "ui:options": { addLabel: "audience" } },
      jobs: { "ui:options": { addLabel: "job" } },
    },
  },
};

test("addLabel: top-level array button reads contextual noun", () => {
  cleanup();
  const { getByRole } = render(
    wrap(
      <RJSFForm
        schema={schema}
        uiSchema={uiSchema}
        formData={{ useCases: [] }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(
    getByRole("button", { name: /add use case/i }),
    '+ Add use case button present',
  );
  cleanup();
});

test("addLabel: nested array buttons read contextual nouns", () => {
  cleanup();
  const { getByRole } = render(
    wrap(
      <RJSFForm
        schema={schema}
        uiSchema={uiSchema}
        formData={{ useCases: [{ audience: [], jobs: [] }] }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(
    getByRole("button", { name: /add audience/i }),
    '+ Add audience button present',
  );
  assert.ok(
    getByRole("button", { name: /add job/i }),
    '+ Add job button present',
  );
  cleanup();
});
