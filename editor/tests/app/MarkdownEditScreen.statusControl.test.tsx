import "../setup-dom";
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { MarkdownEditScreen } from "../../src/app/MarkdownEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";
import { setWysiwygFlag } from "../helpers/editorSurface";

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

function fakeGh(files: Record<string, string>) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const content = files[path];
        if (content === undefined) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return {
          data: { content: b64(content), encoding: "base64", sha: `sha-${path}` },
        };
      },
    },
  } as any;
}

const USAGE_MD = `---\ntitle: "Buttons usage guidelines"\n---\n## When to use\n\nUse a button to trigger an action.\n`;
const META = `# yaml-language-server: $schema=../../../schemas/guideline-meta.json
component: "Buttons"
domains:
  usage: { status: draft }
`;

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

// A full MarkdownEditScreen mount is heavy; on a loaded CI runner the header
// plus the status control's extra async read can exceed the 1000ms default, so
// the appear-waits below use an explicit generous timeout (the fake IO is
// instant, so this is headroom for CPU scheduling, not a masked defect).
// afterEach(cleanup) unmounts the heavy tree even if an assertion throws — a
// leaked mount keeps the node event loop alive and hangs the whole test run.
const APPEAR = { timeout: 8000 };

beforeEach(() => {
  submissionCartSingleton.clear();
  setWysiwygFlag("source");
});
afterEach(() => {
  cleanup();
});

test("MarkdownEditScreen: shows the status control for a component domain file", async () => {
  const gh = fakeGh({
    "components/src/button/usage.md": USAGE_MD,
    "components/src/button/_meta.yml": META,
  });
  render(
    wrap(
      <MarkdownEditScreen path="components/src/button/usage.md" octokit={gh} />,
    ),
  );
  assert.ok(
    await screen.findByRole("button", { name: /mark approved/i }, APPEAR),
  );
});

test("MarkdownEditScreen: no status control for an accessibility file", async () => {
  const gh = fakeGh({ "accessibility/src/buttons.md": "# Buttons a11y\n" });
  render(
    wrap(
      <MarkdownEditScreen path="accessibility/src/buttons.md" octokit={gh} />,
    ),
  );
  // Wait for the file to load (header heading appears), then assert absence.
  await screen.findByText("accessibility/src/buttons.md", undefined, APPEAR);
  assert.equal(screen.queryByRole("button", { name: /mark approved/i }), null);
});
