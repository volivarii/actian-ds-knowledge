import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { RichBodyEditor } from "../../src/markdown-engine/RichBodyEditor";

// Regression coverage for the Major finding: MilkdownBody's useEditor(...)
// runs with [] deps, so its markdownUpdated listener used to capture the
// MOUNT-TIME onChange prop forever. MarkdownEditScreen passes a closure that
// re-joins the CURRENT frontmatter block on every body change
// ((b) => handleChange(joinRawFrontmatter(fmBlock, b))), so once a rich-mode
// write-back updated fmBlock, the next Milkdown keystroke fired the stale
// closure and silently reverted the just-added connection.
//
// This test drives a REAL toolbar command (not a hand-rolled markdown
// string) through the exported RichBodyEditor, so it exercises the actual
// listener wiring end to end: mount with onChange A, re-render with onChange
// B (simulating a parent-driven prop change with no remount, exactly what
// MarkdownEditScreen does when fmBlock changes), then trigger one real
// editor mutation and assert only B observes it.

test("Milkdown listener reads the latest onChange after a prop-only re-render", async () => {
  cleanup();
  const callsA: string[] = [];
  const callsB: string[] = [];
  const onChangeA = (md: string) => callsA.push(md);
  const onChangeB = (md: string) => callsB.push(md);

  const { rerender } = render(
    <Theme>
      <RichBodyEditor initialText={"Body text\n"} onChange={onChangeA} />
    </Theme>,
  );

  // Wait for the real Milkdown editor + toolbar to mount.
  await waitFor(
    () => assert.ok(screen.getByRole("button", { name: /insert table/i })),
    { timeout: 5000 },
  );

  // Re-render with a NEW onChange identity but the SAME key/mount — this is
  // the exact shape of a MarkdownEditScreen re-render after fmBlock changes:
  // RichBodyEditor is not remounted (key is `${path}:${remountNonce}` and
  // neither changed), only the onChange prop's closure is new.
  rerender(
    <Theme>
      <RichBodyEditor initialText={"Body text\n"} onChange={onChangeB} />
    </Theme>,
  );

  // Drive one REAL editor mutation via the toolbar's actual Milkdown command
  // (insertTableCommand), not a simulated call — this is what proves the
  // mount-time listener itself, not just a wrapper function, reads through.
  fireEvent.click(screen.getByRole("button", { name: /insert table/i }));

  await waitFor(
    () => assert.ok(callsA.length > 0 || callsB.length > 0, "toolbar command should have produced a markdown update"),
    { timeout: 5000 },
  );

  assert.equal(
    callsA.length,
    0,
    `stale onChange A must NOT fire after the re-render; got: ${JSON.stringify(callsA)}`,
  );
  assert.ok(
    callsB.length > 0,
    "latest onChange B must fire for the post-rerender editor update",
  );
  assert.match(callsB[callsB.length - 1]!, /\|/, "table markdown should contain a pipe cell");

  cleanup();
});
