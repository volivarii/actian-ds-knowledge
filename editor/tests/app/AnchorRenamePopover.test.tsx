import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Theme } from "@radix-ui/themes";
import React from "react";
import {
  render,
  screen,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { AnchorRenamePopover } from "../../src/app/AnchorRenamePopover";

afterEach(() => {
  cleanup();
});

function mount(
  props: Partial<React.ComponentProps<typeof AnchorRenamePopover>> = {},
) {
  const triggerEl = globalThis.document.createElement("span");
  globalThis.document.body.appendChild(triggerEl);
  const onRename = props.onRename ?? (() => {});
  render(
    <Theme>
      <AnchorRenamePopover
        slug="overview"
        otherSlugs={["intro", "details"]}
        sameFileCount={2}
        crossFileReferrers={["components/src/modal/usage.md"]}
        triggerEl={triggerEl}
        onOpenChange={() => {}}
        {...props}
        onRename={onRename}
      />
    </Theme>,
  );
  return { triggerEl };
}

function slugField(): HTMLInputElement {
  return screen.getByLabelText(/new anchor slug/i) as HTMLInputElement;
}
function renameButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /^rename$/i }) as HTMLButtonElement;
}

test("AnchorRenamePopover: pre-fills the current slug", () => {
  mount();
  assert.equal(slugField().value, "overview");
});

test("AnchorRenamePopover: Rename disabled when the field is unchanged", () => {
  mount();
  assert.equal(renameButton().disabled, true);
});

test("AnchorRenamePopover: Rename disabled when it collides with an existing slug", () => {
  mount();
  fireEvent.change(slugField(), { target: { value: "intro" } });
  assert.equal(renameButton().disabled, true);
});

test("AnchorRenamePopover: Rename disabled when the slug shape is invalid", () => {
  mount();
  fireEvent.change(slugField(), { target: { value: "Bad Slug" } });
  assert.equal(renameButton().disabled, true);
  fireEvent.change(slugField(), { target: { value: "1leading-digit" } });
  assert.equal(renameButton().disabled, true);
});

test("AnchorRenamePopover: valid changed slug enables Rename and calls onRename", () => {
  const calls: string[] = [];
  mount({ onRename: (v) => calls.push(v) });
  fireEvent.change(slugField(), { target: { value: "getting-started" } });
  assert.equal(renameButton().disabled, false);
  fireEvent.click(renameButton());
  assert.deepEqual(calls, ["getting-started"]);
});

test("AnchorRenamePopover: renders the same-file count and cross-file list", () => {
  mount();
  assert.ok(screen.getByText(/2 links in this file/i));
  assert.ok(screen.getByText("components/src/modal/usage.md"));
  assert.ok(screen.getByText(/will not be auto-updated/i));
});
