import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { RJSFForm } from "../../src/form-engine/RJSFForm";

// Sub-task 1114 (F15). The form used to fill every array property the data
// lacked with [] at mount and report that as a change, so opening a content
// file without `wordsToAvoid` staged it with a line the author never wrote.
// Mounting a form is not an edit.

test("mounting a form over data that lacks an array property reports no change", async () => {
  cleanup();
  const calls: unknown[] = [];
  render(
    <Theme>
      <RJSFForm
        schema={{
          type: "object",
          properties: {
            title: { type: "string", title: "Title" },
            wordsToAvoid: { type: "array", items: { type: "string" }, title: "Words to avoid" },
          },
        }}
        uiSchema={{}}
        formData={{ title: "Forms" }}
        onChange={(next) => calls.push(next)}
      />
    </Theme>,
  );
  await act(() => new Promise<void>((r) => setTimeout(r, 50)));
  const changed = calls.filter((c) => JSON.stringify(c) !== JSON.stringify({ title: "Forms" }));
  assert.deepEqual(changed, [], "no change was made, so none may be reported (empty defaults are not edits)");
  cleanup();
});

test("a real default is still applied and reported (control)", async () => {
  cleanup();
  const calls: unknown[] = [];
  render(
    <Theme>
      <RJSFForm
        schema={{
          type: "object",
          properties: { status: { type: "string", title: "Status", default: "draft" } },
        }}
        uiSchema={{}}
        formData={{}}
        onChange={(next) => calls.push(next)}
      />
    </Theme>,
  );
  await act(() => new Promise<void>((r) => setTimeout(r, 50)));
  assert.ok(
    calls.some((c) => JSON.stringify(c) === JSON.stringify({ status: "draft" })),
    "a schema default with a value is a real fill-in, and is reported",
  );
  cleanup();
});
