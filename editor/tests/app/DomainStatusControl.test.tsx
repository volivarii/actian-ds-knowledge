import "../setup-dom";
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Theme } from "@radix-ui/themes";
import React from "react";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { DomainStatusControl } from "../../src/app/DomainStatusControl";
import { submissionCartSingleton } from "../../src/drafts/store-instance";

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

// Octokit stand-in serving one _meta.yml; 404 otherwise.
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

const META_DRAFT = `# yaml-language-server: $schema=../../../schemas/guideline-meta.json
component: "Buttons"
category: action
domains:
  content: { status: draft }
  usage: { status: draft }
  design: { status: inherited }
  behavior: { status: not-started }
  tokens: { status: approved }
`;

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

// afterEach(cleanup) unmounts the tree even if an assertion throws, so a leaked
// mount can never keep the node event loop alive and hang `node --test`.
beforeEach(() => {
  submissionCartSingleton.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
});

test("DomainStatusControl: shows Draft + Mark approved, click stages approved", async () => {
  const gh = fakeGh({ "components/src/button/_meta.yml": META_DRAFT });
  render(wrap(<DomainStatusControl slug="button" domain="usage" octokit={gh} />));

  // Resolves to the draft affordance after the async read.
  const markBtn = await screen.findByRole("button", { name: /mark approved/i });
  assert.ok(markBtn);
  assert.ok(screen.getByText(/^Draft$/));

  fireEvent.click(markBtn);

  // The click stages usage=approved into the cart.
  await waitFor(() => {
    const entry = submissionCartSingleton
      .list()
      .find((e) => e.path === "components/src/button/_meta.yml");
    assert.ok(entry, "_meta.yml staged");
    assert.match(entry!.content, /usage: \{ status: approved \}/);
  });
  // And the control now offers the reverse transition.
  assert.ok(await screen.findByRole("button", { name: /return to draft/i }));
});

test("DomainStatusControl: approved domain shows Approved + Return to draft", async () => {
  const gh = fakeGh({ "components/src/button/_meta.yml": META_DRAFT });
  // Stage content=approved first, then the control should read it back.
  const { setDomainStatus } = await import("../../src/lib/workspaceState");
  await setDomainStatus(gh, "button", "content", "approved");
  render(wrap(<DomainStatusControl slug="button" domain="content" octokit={gh} />));
  assert.ok(await screen.findByRole("button", { name: /return to draft/i }));
  assert.ok(screen.getByText(/^Approved$/));
});

test("DomainStatusControl: re-reads status when the domain prop changes", async () => {
  // Guards navigation-status-tracking cheaply (no heavy screen mount): the
  // read effect must re-run on a domain change and reflect the new domain.
  const meta = `# yaml-language-server: $schema=../../../schemas/guideline-meta.json
component: "Buttons"
domains:
  usage: { status: draft }
  design: { status: approved }
`;
  const gh = fakeGh({ "components/src/button/_meta.yml": meta });
  const { rerender } = render(
    wrap(<DomainStatusControl slug="button" domain="usage" octokit={gh} />),
  );
  // usage → draft.
  assert.ok(await screen.findByRole("button", { name: /mark approved/i }));
  // Change domain prop to design (approved).
  rerender(
    wrap(<DomainStatusControl slug="button" domain="design" octokit={gh} />),
  );
  assert.ok(await screen.findByRole("button", { name: /return to draft/i }));
  assert.equal(screen.queryByRole("button", { name: /mark approved/i }), null);
});
