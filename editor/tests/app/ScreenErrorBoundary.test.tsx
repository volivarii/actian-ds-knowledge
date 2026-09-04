// #651: React 18 unmounts the whole root when a render throws, and the editor
// had no boundary anywhere, so a 403 on one directory blanked the app.
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { ScreenErrorBoundary } from "../../src/app/ScreenErrorBoundary";

afterEach(cleanup);

let explode = true;
function Screen() {
  if (explode) throw new Error("recipes directory answered 403");
  return <p>the screen</p>;
}

test("a throw in the screen renders the error and the path, not a blank page", () => {
  explode = true;
  const originalError = console.error;
  console.error = () => {}; // React logs the caught error; the test is about the DOM
  try {
    const { container } = render(
      <Theme>
        <ScreenErrorBoundary path="app-context/src/patterns/forms.md">
          <Screen />
        </ScreenErrorBoundary>
      </Theme>,
    );
    const text = container.textContent ?? "";
    assert.match(text, /recipes directory answered 403/);
    assert.match(text, /app-context\/src\/patterns\/forms\.md/);
    assert.ok(container.querySelector('[role="alert"]'), "the failure is not an alert");
    const h1s = [...container.querySelectorAll("h1")].map((h) => h.textContent);
    assert.equal(h1s.length, 1, `the fallback must carry exactly one h1; found ${h1s.length}`);
    // `role="alert"` reads the moment it appears. Repeating the heading's
    // sentence there made a screen reader say it twice and buried the
    // message at the end of the second reading.
    const alert = container.querySelector('[role="alert"]')!.textContent ?? "";
    assert.equal(
      alert.includes(h1s[0] ?? ""),
      false,
      `the alert repeats the heading verbatim: ${alert}`,
    );
  } finally {
    console.error = originalError;
  }
});

test("a new resetKey recovers the screen without a path change", () => {
  // Re-selecting the same screen (Home again, the same file) changes no
  // path, and the tab strip that would change the explore tab lives inside
  // the fallen pane. The shell bumps a key on every selection instead.
  explode = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    const { container, rerender } = render(
      <Theme>
        <ScreenErrorBoundary path="home" resetKey="coverage:1">
          <Screen />
        </ScreenErrorBoundary>
      </Theme>,
    );
    assert.ok(
      container.querySelector("[data-screen-boundary]"),
      "the fallback carries no boundary marker",
    );
    explode = false;
    rerender(
      <Theme>
        <ScreenErrorBoundary path="home" resetKey="coverage:2">
          <Screen />
        </ScreenErrorBoundary>
      </Theme>,
    );
    assert.match(container.textContent ?? "", /the screen/);
  } finally {
    console.error = originalError;
  }
});

test("Try again re-renders the screen", () => {
  explode = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    const { container, getByRole } = render(
      <Theme>
        <ScreenErrorBoundary path="x">
          <Screen />
        </ScreenErrorBoundary>
      </Theme>,
    );
    explode = false;
    fireEvent.click(getByRole("button", { name: /try again/i }));
    assert.match(container.textContent ?? "", /the screen/);
  } finally {
    console.error = originalError;
  }
});

test("the fallback stays across a re-render with the same path and reset key", () => {
  // Resetting is a response to a CHANGE after the catch; a re-render of the
  // same screen (React's own retry, a parent state change) must not clear it.
  explode = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    const { container, rerender } = render(
      <Theme>
        <ScreenErrorBoundary path="b" resetKey="k">
          <Screen />
        </ScreenErrorBoundary>
      </Theme>,
    );
    assert.ok(container.querySelector('[role="alert"]'));
    explode = false;
    rerender(
      <Theme>
        <ScreenErrorBoundary path="b" resetKey="k">
          <Screen />
        </ScreenErrorBoundary>
      </Theme>,
    );
    assert.ok(container.querySelector('[role="alert"]'), "a same-props re-render cleared the fallback");
  } finally {
    console.error = originalError;
  }
});
