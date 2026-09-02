import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { CanonicalRenderPanel } from "../../src/app/CanonicalRenderPanel";
import { resetCanonicalRenderCache } from "../../src/lib/loadCanonicalRender";

const DIST = "components/render/dist";
const FRAGMENT =
  '<div id="fidelity-root" data-slug="button"><button class="ds-button ds-button--primary">Primary</button></div>';

function files(over: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
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
    [`${DIST}/fragments/button.html`]: FRAGMENT,
    "package.json": JSON.stringify({ version: "0.34.169" }),
    "components/dist/media/_index.json": JSON.stringify({
      _schema_version: 1,
      media: {
        button: {
          preview: "components/dist/media/button/preview.webp",
          default: "components/dist/media/button/default.webp",
        },
      },
    }),
    "components/dist/media/button/preview.webp": "RIFF-webp-bytes",
  };
  return { ...base, ...over };
}

function fakeGh(map: Record<string, string | undefined>) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const content = map[path];
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
    },
  } as any;
}

function show(gh: any, slug = "button") {
  render(
    <Theme>
      <CanonicalRenderPanel slug={slug} octokit={gh} />
    </Theme>,
  );
}

beforeEach(() => {
  resetCanonicalRenderCache();
  globalThis.sessionStorage.clear();
});
afterEach(() => cleanup());

test("a rendered component shows its canonical render in a sandboxed frame", async () => {
  show(fakeGh(files()));
  const frame = await screen.findByTitle(/canonical render of button/i);
  assert.equal(frame.tagName, "IFRAME");
  const doc = frame.getAttribute("srcdoc") ?? "";
  assert.ok(doc.includes(FRAGMENT), "the frame carries the fragment markup");
  assert.ok(doc.includes(".ds-button{color:red}"), "the frame carries the stylesheet");
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts", "scripts only, no same-origin");
});

test("the Figma capture sits beside the render, named for what it is", async () => {
  show(fakeGh(files()));
  const img = await screen.findByAltText(/figma capture of button/i);
  assert.ok((img.getAttribute("src") ?? "").startsWith("data:image/webp;base64,"));
  assert.ok(screen.getByText(/canonical render/i));
  assert.ok(screen.getByText(/figma capture/i));
});

test("the panel says which version the render was read at", async () => {
  show(fakeGh(files()));
  await screen.findByTitle(/canonical render of button/i);
  assert.ok(screen.getByText(/v0\.34\.169/));
});

test("a component with no render fragment says so, and shows no frame", async () => {
  show(fakeGh(files()), "tabs");
  assert.ok(await screen.findByText(/no canonical render/i));
  assert.equal(screen.queryByTitle(/canonical render of tabs/i), null);
});

test("a component with no Figma capture says so instead of leaving a blank", async () => {
  show(
    fakeGh(
      files({
        "components/dist/media/_index.json": JSON.stringify({ _schema_version: 1, media: {} }),
      }),
    ),
  );
  await screen.findByTitle(/canonical render of button/i);
  assert.ok(await screen.findByText(/no figma capture/i));
  assert.equal(screen.queryByAltText(/figma capture of button/i), null);
});

test("a render that cannot be loaded reports the failure by name", async () => {
  show(fakeGh(files({ [`${DIST}/render.css`]: undefined })));
  assert.ok(await screen.findByText(/render\.css/));
  assert.equal(screen.queryByTitle(/canonical render of button/i), null);
});
