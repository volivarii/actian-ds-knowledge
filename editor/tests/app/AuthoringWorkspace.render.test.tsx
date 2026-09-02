import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { AuthoringWorkspace } from "../../src/app/AuthoringWorkspace";
import { resetCanonicalRenderCache } from "../../src/lib/loadCanonicalRender";

// A component test proves the panel works. This one proves the workspace
// RENDERS it, on the page, outside any collapsed section: the two ways a
// working panel shipped invisible on 2026-09-01 (mounted in a form that never
// mounted; then inside a section CSS had collapsed).

const DIST = "components/render/dist";
const FILES: Record<string, string> = {
  "components/src/button/_meta.yml": [
    'component: "Button"',
    "category: action",
    "domains:",
    "  content: { status: not-started }",
    "  usage: { status: not-started }",
    "  design: { status: not-started }",
    "  behavior: { status: not-started }",
    "  tokens: { status: not-started }",
    "",
  ].join("\n"),
  [`${DIST}/render-manifest.json`]: JSON.stringify({
    schemaVersion: "1.1.0",
    css: "render.css",
    fontsCss: "render-fonts.css",
    renders: [
      { slug: "button", group: "Action", fragment: "fragments/button.html", source: "rendered" },
    ],
  }),
  [`${DIST}/render.css`]: ".ds-button{color:red}",
  [`${DIST}/render-fonts.css`]: "@font-face{font-family:T}",
  [`${DIST}/fragments/button.html`]:
    '<div id="fidelity-root" data-slug="button"><button class="ds-button">Primary</button></div>',
  "package.json": JSON.stringify({ version: "0.34.169" }),
  "components/dist/media/_index.json": JSON.stringify({ _schema_version: 1, media: {} }),
};

function fakeGh() {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const content = FILES[path];
        if (content === undefined) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return {
          data: {
            content: Buffer.from(content).toString("base64"),
            encoding: "base64",
            sha: `sha-${path}`,
          },
        };
      },
      listCommits: async () => ({ data: [] }),
    },
  } as any;
}

beforeEach(() => {
  resetCanonicalRenderCache();
  globalThis.sessionStorage.clear();
});
afterEach(() => cleanup());

test("the workspace renders the canonical render frame, outside any collapsed section", async () => {
  render(
    <Theme>
      <AuthoringWorkspace
        slug="button"
        octokit={fakeGh()}
        onNavigate={() => {}}
        onBack={() => {}}
      />
    </Theme>,
  );
  const frame = await screen.findByTitle(/canonical render of button/i, {}, { timeout: 5000 });
  assert.equal(frame.closest("[hidden]"), null, "not under a hidden ancestor");
  assert.equal(
    frame.closest('[data-state="closed"]'),
    null,
    "not inside a collapsed accordion item",
  );
  assert.ok(screen.getByText(/Authoring tasks/), "the rest of the workspace is still there");
});
