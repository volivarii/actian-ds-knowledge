import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { RichBodyEditor } from "../../src/markdown-engine/RichBodyEditor";

test("renders an accessible rich body region by default", async () => {
  cleanup();
  render(<Theme><RichBodyEditor initialText={"## Purpose\n\nHi\n"} onChange={() => {}} filename="studio.md" /></Theme>);
  await waitFor(() => assert.ok(screen.getByRole("textbox", { name: /body editor/i })), { timeout: 5000 });
  cleanup();
});

test("toggling to source shows CodeMirror with the same markdown", async () => {
  cleanup();
  render(<Theme><RichBodyEditor initialText={"## Purpose\n\nHi\n"} onChange={() => {}} /></Theme>);
  await waitFor(() => assert.ok(screen.getByRole("button", { name: /source/i })), { timeout: 5000 });
  fireEvent.click(screen.getByRole("button", { name: /source/i }));
  await waitFor(() => assert.ok(screen.getByText(/## Purpose/), "source view shows raw markdown"));
  cleanup();
});
