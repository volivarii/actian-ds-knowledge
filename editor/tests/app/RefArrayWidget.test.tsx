import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { RefArrayWidget } from "../../src/form-engine/widgets/RefArrayWidget";

function props(
  value: unknown,
  refDomain: string,
  onChange: (v: unknown) => void = () => {},
) {
  return {
    value,
    onChange,
    disabled: false,
    readonly: false,
    id: "refs",
    options: { refDomain },
    formContext: {},
  } as any;
}

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

test("motion ref renders as its title, never the slug", () => {
  cleanup();
  render(wrap(<RefArrayWidget {...props([{ ref: "state-transitions" }], "motion")} />));
  // Title comes from foundations/dist/tokens/motion.json patterns[*].name.
  assert.equal(
    screen.queryByText("state-transitions"),
    null,
    "never shows the slug",
  );
  cleanup();
});

test("a11y ref renders as a title chip", () => {
  cleanup();
  render(wrap(<RefArrayWidget {...props([{ ref: "color-contrast" }], "accessibility")} />));
  assert.ok(
    screen.queryByText(/contrast/i),
    "shows a human title for the a11y slug",
  );
  cleanup();
});

test("remove button calls onChange without the removed ref", () => {
  cleanup();
  let next: unknown = null;
  render(
    wrap(
      <RefArrayWidget
        {...props([{ ref: "color-contrast" }], "accessibility", (v) => {
          next = v;
        })}
      />,
    ),
  );
  const removeBtn = screen.getByRole("button", { name: /Remove/i });
  removeBtn.click();
  assert.deepEqual(next, []);
  cleanup();
});
