import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { RJSFSchema } from "@rjsf/utils";
import { RJSFForm } from "../../src/form-engine/RJSFForm";
import { metaFormTemplates } from "../../src/form-engine/templates";

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

const describedSchema: RJSFSchema = {
  type: "object",
  properties: {
    label: { type: "string", title: "App label", description: "Human-readable display name." },
  },
};

test("scalar field shows its label and description", () => {
  cleanup();
  const { getByText } = render(
    wrap(<RJSFForm schema={describedSchema} formData={{ label: "x" }} onChange={() => {}} />),
  );
  assert.ok(getByText("App label"), "label renders");
  // Descriptions are help-on-demand now: a focusable info glyph carries it.
  const glyph = document.querySelector(
    '[aria-label="Human-readable display name."]',
  );
  assert.ok(glyph, "description reachable via the info glyph");
  cleanup();
});

const arraySchema: RJSFSchema = {
  type: "object",
  properties: { tags: { type: "array", title: "Tags", items: { type: "string" } } },
};

test("primitive array items show no redundant per-item label", () => {
  cleanup();
  const { getByText, queryAllByText } = render(
    wrap(<RJSFForm schema={arraySchema} formData={{ tags: ["a", "b"] }} onChange={() => {}} />),
  );
  assert.ok(getByText("Tags"), "array title renders once");
  assert.equal(queryAllByText(/tags[-\s]?\d/i).length, 0, "no tags-1 / tags 1 item labels");
  cleanup();
});

test("meta form still suppresses descriptions (override wins)", () => {
  cleanup();
  const metaSchema: RJSFSchema = {
    type: "object",
    properties: { component: { type: "string", title: "Component", description: "VERBOSE DESC" } },
  };
  const { queryByText, getByText } = render(
    wrap(
      <RJSFForm
        schema={metaSchema}
        templates={metaFormTemplates}
        formData={{ component: "Buttons" }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(getByText("Component"), "meta label renders");
  assert.equal(queryByText("VERBOSE DESC"), null, "meta description suppressed by MetaFieldTemplate");
  cleanup();
});

test("scalar field with ui:help renders the help text", () => {
  cleanup();
  const helpSchema: RJSFSchema = {
    type: "object",
    properties: { fieldName: { type: "string", title: "My Field" } },
  };
  const { getByText } = render(
    wrap(
      <RJSFForm
        schema={helpSchema}
        uiSchema={{ fieldName: { "ui:help": "some help" } }}
        formData={{ fieldName: "" }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(getByText("some help"), "ui:help text renders via rawHelp");
  cleanup();
});
