import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import { RJSFForm } from "../../src/form-engine/RJSFForm";

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

test("textarea widget renders as Radix TextArea", () => {
  cleanup();
  const schema: RJSFSchema = {
    type: "object",
    properties: { body: { type: "string", title: "Body" } },
  };
  const uiSchema: UiSchema = { body: { "ui:widget": "textarea" } };
  const { container } = render(
    wrap(
      <RJSFForm
        schema={schema}
        uiSchema={uiSchema}
        formData={{ body: "x" }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(
    container.querySelector("textarea.rt-TextAreaInput"),
    "Radix textarea present",
  );
  assert.equal(
    container.querySelector("textarea.form-control"),
    null,
    "no Bootstrap textarea",
  );
  cleanup();
});

test("enum field renders as a Radix Select trigger", () => {
  cleanup();
  const schema: RJSFSchema = {
    type: "object",
    properties: {
      variant: { type: "string", title: "Variant", enum: ["compact", "full"] },
    },
  };
  const { container } = render(
    wrap(
      <RJSFForm
        schema={schema}
        formData={{ variant: "compact" }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(
    container.querySelector(".rt-SelectTrigger"),
    "Radix Select trigger present",
  );
  assert.equal(
    container.querySelector("select.form-control"),
    null,
    "no Bootstrap select",
  );
  cleanup();
});

test("multi-select enum field renders native select[multiple] with correct options", () => {
  cleanup();
  const schema: RJSFSchema = {
    type: "object",
    properties: {
      roles: {
        type: "array",
        uniqueItems: true,
        items: { type: "string", enum: ["admin", "editor", "viewer"] },
      },
    },
  };
  const { container } = render(
    wrap(
      <RJSFForm
        schema={schema}
        formData={{ roles: ["admin"] }}
        onChange={() => {}}
      />,
    ),
  );
  const sel = container.querySelector("select[multiple]");
  assert.ok(sel, "native select[multiple] present");
  const opts = Array.from(sel!.querySelectorAll("option"));
  assert.equal(opts.length, 3, "3 options rendered");
  assert.equal(opts[0]?.textContent, "admin");
  assert.equal(opts[1]?.textContent, "editor");
  assert.equal(opts[2]?.textContent, "viewer");
  cleanup();
});
