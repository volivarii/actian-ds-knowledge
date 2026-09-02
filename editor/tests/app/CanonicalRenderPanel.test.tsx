import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { CanonicalRenderPanel } from "../../src/app/CanonicalRenderPanel";

const DIST = "components/render/dist";
const FRAGMENT =
  '<div id="fidelity-root" data-slug="button"><button class="ds-button ds-button--primary">Primary</button></div>';

function manifest(slugs: string[]) {
  return JSON.stringify({
    schemaVersion: "1.2.0",
    css: "render.css",
    fontsCss: "render-fonts.css",
    pageCss: "body{margin:0;padding:24px;background:#fff}",
    renders: slugs.map((slug) => ({ slug, group: "Action", fragment: `fragments/${slug}.html`, source: "rendered" })),
  });
}

function files(over: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    [`${DIST}/render-manifest.json`]: manifest(["button"]),
    [`${DIST}/render.css`]: ".ds-button{color:red}",
    [`${DIST}/render-fonts.css`]: "@font-face{font-family:T}",
    [`${DIST}/fragments/button.html`]: FRAGMENT,
    "paths-manifest.json": JSON.stringify({ knowledge_version: "0.34.169" }),
    "components/dist/identity.json": JSON.stringify({ schemaVersion: "1.0.0", entries: {} }),
    "components/dist/media/_index.json": JSON.stringify({
      _schema_version: 1,
      media: {
        button: {
          preview: "components/dist/media/button/preview.webp",
          default: "components/dist/media/button/default.webp",
        },
      },
    }),
    "components/dist/media/button/preview.webp": "RIFF-webp-preview",
    "components/dist/media/button/default.webp": "RIFF-webp-default",
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
      listCommits: async () => ({ data: [] }),
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

beforeEach(() => globalThis.sessionStorage.clear());
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

// Which capture is on the right changes what a disagreement MEANS: the
// isolated default variant is the render's like-for-like counterpart, the doc
// page's preview frame is a page of many variants. 198 slugs have a default and
// 88 have a preview, so without saying which, the same column meant two
// different things depending on the component.
test("the capture column says it is showing the isolated default variant", async () => {
  show(fakeGh(files()));
  await screen.findByAltText(/figma capture of button/i);
  assert.ok(screen.getByText(/default variant, captured on its own/i));
});

test("a slug with only a doc preview says so instead of claiming a default", async () => {
  const previewOnly = files({
    "components/dist/media/_index.json": JSON.stringify({
      _schema_version: 1,
      media: { button: { preview: "components/dist/media/button/preview.webp" } },
    }),
  });
  show(fakeGh(previewOnly));
  await screen.findByAltText(/figma capture of button/i);
  assert.ok(screen.getByText(/whole documentation page/i));
});

test("the panel says which version the render was read at", async () => {
  show(fakeGh(files()));
  await screen.findByTitle(/canonical render of button/i);
  assert.ok(screen.getByText(/v0\.34\.169/));
});

test("an unknown version leaves the caption without a version, not with 'vnull'", async () => {
  show(fakeGh(files({ "paths-manifest.json": undefined })));
  await screen.findByTitle(/canonical render of button/i);
  assert.equal(screen.queryByText(/vnull|vundefined|read at/i), null);
});

test("a renamed component shows the render and capture filed under its current slug", async () => {
  show(
    fakeGh(
      files({
        [`${DIST}/render-manifest.json`]: manifest(["tooltip-default"]),
        [`${DIST}/fragments/tooltip-default.html`]:
          '<div id="fidelity-root" data-slug="tooltip-default"><span class="ds-tooltip">Tip</span></div>',
        "components/dist/identity.json": JSON.stringify({
          schemaVersion: "1.0.0",
          entries: { abc: { slug: "tooltip-default", previousSlugs: ["tooltip"], kind: null } },
        }),
        "components/dist/media/_index.json": JSON.stringify({
          _schema_version: 1,
          media: { "tooltip-default": { preview: "components/dist/media/tooltip-default/preview.webp" } },
        }),
        "components/dist/media/tooltip-default/preview.webp": "RIFF-webp-bytes",
      }),
    ),
    "tooltip",
  );
  const frame = await screen.findByTitle(/canonical render of tooltip/i);
  assert.ok((frame.getAttribute("srcdoc") ?? "").includes('data-slug="tooltip-default"'));
  assert.ok(await screen.findByAltText(/figma capture of tooltip/i));
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

test("a media index that cannot be read is a capture error, never 'no capture'", async () => {
  show(fakeGh(files({ "components/dist/media/_index.json": undefined })));
  await screen.findByTitle(/canonical render of button/i);
  assert.ok(await screen.findByText(/could not load the capture.*_index\.json/i));
  assert.equal(screen.queryByText(/no figma capture/i), null, "a failed read must not read as an absence");
});

test("a render that cannot be loaded reports the failure by name", async () => {
  show(fakeGh(files({ [`${DIST}/render.css`]: undefined })));
  assert.ok(await screen.findByText(/render\.css/));
  assert.equal(screen.queryByTitle(/canonical render of button/i), null);
});
