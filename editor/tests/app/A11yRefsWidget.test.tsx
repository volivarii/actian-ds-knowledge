import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { A11yRefsWidget } from "../../src/form-engine/widgets/A11yRefsWidget";

function props(value: unknown, onChange: (v: unknown) => void = () => {}) {
  return {
    value,
    onChange,
    disabled: false,
    readonly: false,
    id: "a11y_refs",
    formContext: {},
  } as any;
}

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

test("renders picked refs as titles, not slugs", () => {
  cleanup();
  render(wrap(<A11yRefsWidget {...props([{ ref: "buttons" }])} />));
  assert.ok(screen.queryByText("Buttons"), "shows the title");
  assert.equal(screen.queryByText("buttons"), null, "never shows the slug");
  cleanup();
});

test("renders nothing (no chips) when value is undefined", () => {
  cleanup();
  const { container } = render(wrap(<A11yRefsWidget {...props(undefined)} />));
  assert.ok(container, "renders without crashing");
  // No chip badges for undefined value
  const badges = container.querySelectorAll(".rt-Badge");
  assert.equal(badges.length, 0, "no chips rendered for undefined value");
  cleanup();
});

test("renders nothing (no chips) when value is empty array", () => {
  cleanup();
  const { container } = render(wrap(<A11yRefsWidget {...props([])} />));
  const badges = container.querySelectorAll(".rt-Badge");
  assert.equal(badges.length, 0, "no chips rendered for empty array");
  cleanup();
});

test("removing a chip calls onChange without that ref", () => {
  cleanup();
  let lastValue: unknown = undefined;
  const initialRefs = [{ ref: "buttons" }, { ref: "color-contrast" }];
  render(
    wrap(
      <A11yRefsWidget
        {...props(initialRefs, (v) => {
          lastValue = v;
        })}
      />,
    ),
  );
  // Both titles should be visible
  assert.ok(screen.queryByText("Buttons"), "Buttons chip rendered");
  // color-contrast title includes a section number prefix in the real data
  assert.ok(
    screen.queryByText(/Color.*Contrast/i),
    "Color & Contrast chip rendered",
  );

  // Click the remove button for "buttons"
  const removeBtn = screen.getByRole("button", { name: /Remove Buttons/i });
  removeBtn.click();

  assert.ok(Array.isArray(lastValue), "onChange called with array");
  const refs = lastValue as { ref: string }[];
  assert.equal(refs.length, 1, "one ref remains after removal");
  assert.equal(
    refs[0]?.ref,
    "color-contrast",
    "remaining ref is color-contrast",
  );
  cleanup();
});

test("shows tier badge for each chip", () => {
  cleanup();
  render(wrap(<A11yRefsWidget {...props([{ ref: "buttons" }])} />));
  // "buttons" has tier "component-pattern"
  assert.ok(
    screen.queryByText(/component.pattern/i),
    "tier badge visible for component-pattern",
  );
  cleanup();
});

test("does not show slugs in rendered text (vocabulary doctrine)", () => {
  cleanup();
  const { container } = render(
    wrap(
      <A11yRefsWidget
        {...props([{ ref: "buttons" }, { ref: "color-contrast" }])}
      />,
    ),
  );
  const text = container.textContent ?? "";
  assert.equal(
    text.includes("buttons"),
    false,
    "slug 'buttons' must not appear in rendered text",
  );
  assert.equal(
    text.includes("color-contrast"),
    false,
    "slug 'color-contrast' must not appear in rendered text",
  );
  cleanup();
});

test("renders multiple chips for multiple refs", () => {
  cleanup();
  render(
    wrap(
      <A11yRefsWidget
        {...props([{ ref: "buttons" }, { ref: "color-contrast" }])}
      />,
    ),
  );
  assert.ok(screen.queryByText("Buttons"), "Buttons chip visible");
  // color-contrast title includes a section number prefix in the real a11y-index
  assert.ok(
    screen.queryByText(/Color.*Contrast/i),
    "Color & Contrast chip visible",
  );
  cleanup();
});

test("unknown slug falls back to slug as display text (graceful degradation)", () => {
  cleanup();
  render(
    wrap(<A11yRefsWidget {...props([{ ref: "nonexistent-slug-xyz" }])} />),
  );
  // When taxonomy has no title, it should fall back to the ref itself
  // (this is acceptable graceful degradation, not a vocabulary violation)
  assert.ok(
    screen.queryByText("nonexistent-slug-xyz"),
    "unknown slug shown as fallback text",
  );
  cleanup();
});

test("hides chip controls when readonly", () => {
  cleanup();
  render(
    wrap(
      <A11yRefsWidget
        {...({
          value: [{ ref: "buttons" }],
          onChange: () => {},
          disabled: false,
          readonly: true,
          id: "a11y_refs",
          formContext: {},
        } as any)}
      />,
    ),
  );
  // Title still shown
  assert.ok(screen.queryByText("Buttons"));
  // Remove and edit affordances must not be rendered
  assert.equal(screen.queryByLabelText(/Remove Buttons/i), null);
  assert.equal(screen.queryByLabelText(/Edit note for Buttons/i), null);
  cleanup();
});
