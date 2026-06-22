import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import { RJSFForm } from "../../src/form-engine/RJSFForm";
import { TagInputWidget } from "../../src/form-engine/widgets/TagInputWidget";

const schema: RJSFSchema = {
  type: "object",
  properties: { tags: { type: "array", items: { type: "string" } } },
};
const uiSchema: UiSchema = { tags: { "ui:widget": "TagInput" } };

test("TagInput — renders existing values as chips", () => {
  cleanup();
  render(
    <Theme>
      <RJSFForm
        schema={schema}
        uiSchema={uiSchema}
        widgets={{ TagInput: TagInputWidget }}
        formData={{ tags: ["please", "sorry"] }}
        onChange={() => {}}
        onSubmit={() => {}}
      />
    </Theme>,
  );
  assert.ok(screen.getByText("please"));
  assert.ok(screen.getByText("sorry"));
  cleanup();
});

test("TagInput — typing a word + Enter adds a chip", () => {
  cleanup();
  let latest: any = null;
  render(
    <Theme>
      <RJSFForm
        schema={schema}
        uiSchema={uiSchema}
        widgets={{ TagInput: TagInputWidget }}
        formData={{ tags: [] }}
        onChange={(e: any) => {
          latest = e;
        }}
        onSubmit={() => {}}
      />
    </Theme>,
  );
  const input = screen.getByPlaceholderText("Type a word and press Enter…");
  fireEvent.change(input, { target: { value: "execute" } });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.deepEqual(latest.tags, ["execute"]);
  cleanup();
});
