import "../setup-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { RJSFSchema } from "@rjsf/utils";
import { RJSFForm } from "../../src/form-engine/RJSFForm";

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

const schema: RJSFSchema = {
  type: "object",
  properties: { label: { type: "string", title: "Label" } },
};

test("string fields render as Radix TextField, not Bootstrap form-control", () => {
  cleanup();
  const { container } = render(
    wrap(
      <RJSFForm
        schema={schema}
        formData={{ label: "hi" }}
        onChange={() => {}}
      />,
    ),
  );
  assert.ok(
    container.querySelector("input.rt-TextFieldInput"),
    "Radix text field present",
  );
  assert.equal(
    container.querySelector("input.form-control"),
    null,
    "no Bootstrap input",
  );
  cleanup();
});

test("typing in the field flows through onChange", () => {
  cleanup();
  let latest: any = { label: "hi" };
  const { container } = render(
    // RJSFForm's onChange receives the unwrapped formData object directly
    // (RJSFForm does onChange={(e) => onChange(e.formData)} internally),
    // which is why latest.label reads the field value.
    wrap(
      <RJSFForm
        schema={schema}
        formData={latest}
        onChange={(n) => (latest = n)}
      />,
    ),
  );
  const input = container.querySelector(
    "input.rt-TextFieldInput",
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "hello" } });
  assert.equal(latest.label, "hello");
  cleanup();
});

test("cleared field yields undefined (empty-value clear contract)", () => {
  cleanup();
  let latest: any = { label: "hi" };
  const { container } = render(
    // RJSFForm's onChange receives the unwrapped formData object directly
    // (RJSFForm does onChange={(e) => onChange(e.formData)} internally),
    // which is why latest.label reads the field value.
    wrap(
      <RJSFForm
        schema={schema}
        formData={latest}
        onChange={(n) => (latest = n)}
      />,
    ),
  );
  const input = container.querySelector(
    "input.rt-TextFieldInput",
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "" } });
  // No ui:emptyValue set, so RJSF maps an empty string to undefined for string fields.
  assert.equal(latest.label, undefined, "cleared field yields undefined");
  cleanup();
});
