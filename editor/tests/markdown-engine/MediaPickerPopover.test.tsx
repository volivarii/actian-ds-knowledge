import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { MediaPickerPopover } from "../../src/markdown-engine/MediaPickerPopover";

const INDEX = {
  media: {
    "alert-banner": {
      preview: "components/dist/media/alert-banner/preview.webp",
      variations: ["components/dist/media/alert-banner/variations-0.webp"],
      layout: ["components/dist/media/alert-banner/layout-0.webp"],
      default: "components/dist/media/alert-banner/default.webp",
    },
  },
};

function fakeGh() {
  const indexB64 = Buffer.from(JSON.stringify(INDEX)).toString("base64");
  const imgB64 = Buffer.from("img").toString("base64");
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/dist/media/_index.json") {
          return { data: { content: indexB64, encoding: "base64" } };
        }
        return { data: { content: imgB64, encoding: "base64" } };
      },
    },
  } as any;
}

function wrap(node: React.ReactNode) {
  return <Theme>{node}</Theme>;
}

test("offers only author roles, never preview/default", async () => {
  globalThis.sessionStorage.clear();
  cleanup();
  render(
    wrap(
      <MediaPickerPopover octokit={fakeGh()} componentSlug="alert-banner" onInsert={() => {}} />,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /insert media/i }));
  assert.ok(await screen.findByText(/Variations/i), "Variations offered");
  assert.ok(screen.queryByText(/^Layout$/i), "Layout offered");
  assert.equal(screen.queryByText(/preview/i), null, "preview never offered");
  assert.equal(screen.queryByText(/^default$/i), null, "default never offered");
  cleanup();
});

test("inserting a role emits the correct <Media> directive", async () => {
  globalThis.sessionStorage.clear();
  cleanup();
  let inserted: string | null = null;
  render(
    wrap(
      <MediaPickerPopover
        octokit={fakeGh()}
        componentSlug="alert-banner"
        onInsert={(s) => (inserted = s)}
      />,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /insert media/i }));
  await screen.findByText(/Variations/i);
  fireEvent.click(screen.getByText(/Variations/i));
  fireEvent.click(screen.getByRole("button", { name: /^Insert/i }));
  await waitFor(() => assert.ok(inserted !== null, "onInsert fired"));
  assert.equal(inserted, '\n<Media role="variations" layout="grid" />\n');
  cleanup();
});

test("empty state when the component has no placeable media", async () => {
  globalThis.sessionStorage.clear();
  cleanup();
  const gh = {
    repos: {
      getContent: async () => ({
        data: {
          content: Buffer.from(JSON.stringify({ media: { x: { default: "d" } } })).toString("base64"),
          encoding: "base64",
        },
      }),
    },
  } as any;
  render(wrap(<MediaPickerPopover octokit={gh} componentSlug="x" onInsert={() => {}} />));
  fireEvent.click(screen.getByRole("button", { name: /insert media/i }));
  assert.ok(await screen.findByText(/no captured media/i));
  cleanup();
});
