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

const arraySchema: RJSFSchema = {
  type: "object",
  properties: {
    tags: { type: "array", title: "Tags", items: { type: "string" } },
  },
};

test("array controls render with accessible names, no glyphicons", () => {
  cleanup();
  const { getAllByRole, getByRole, container } = render(
    wrap(
      <RJSFForm
        schema={arraySchema}
        formData={{ tags: ["alpha", "beta"] }}
        onChange={() => {}}
      />,
    ),
  );
  assert.equal(getAllByRole("button", { name: /move up/i }).length, 2);
  assert.equal(getAllByRole("button", { name: /move down/i }).length, 2);
  assert.equal(getAllByRole("button", { name: /remove/i }).length, 2);
  assert.ok(getByRole("button", { name: /add/i }), "Add button present");
  assert.equal(
    container.querySelector(".glyphicon"),
    null,
    "no glyphicon icons",
  );
  cleanup();
});

test("first item move-up is disabled, last item move-down is disabled", () => {
  cleanup();
  const { getAllByRole } = render(
    wrap(
      <RJSFForm
        schema={arraySchema}
        formData={{ tags: ["alpha", "beta"] }}
        onChange={() => {}}
      />,
    ),
  );
  const ups = getAllByRole("button", { name: /move up/i });
  const downs = getAllByRole("button", { name: /move down/i });
  assert.equal(
    (ups[0] as HTMLButtonElement).disabled,
    true,
    "first move-up disabled",
  );
  assert.equal(
    (downs[1] as HTMLButtonElement).disabled,
    true,
    "last move-down disabled",
  );
  assert.equal(
    (ups[1] as HTMLButtonElement).disabled,
    false,
    "second move-up enabled",
  );
  assert.equal(
    (downs[0] as HTMLButtonElement).disabled,
    false,
    "first move-down enabled",
  );
  cleanup();
});

test("Add appends an item; Remove drops one", () => {
  cleanup();
  let latest: any = { tags: ["alpha", "beta"] };
  const { getByRole, getAllByRole, rerender } = render(
    wrap(
      <RJSFForm
        schema={arraySchema}
        formData={latest}
        onChange={(next) => {
          latest = next;
        }}
      />,
    ),
  );
  fireEvent.click(getByRole("button", { name: /add/i }));
  assert.equal((latest.tags as unknown[]).length, 3, "Add produced 3 items");

  rerender(
    wrap(
      <RJSFForm
        schema={arraySchema}
        formData={{ tags: ["alpha", "beta"] }}
        onChange={(n) => (latest = n)}
      />,
    ),
  );
  fireEvent.click(getAllByRole("button", { name: /remove/i })[0]!);
  assert.deepEqual(latest.tags, ["beta"], "Remove dropped the first item");
  cleanup();
});
