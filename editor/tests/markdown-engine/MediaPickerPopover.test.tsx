import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
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
      <MediaPickerPopover
        octokit={fakeGh()}
        componentSlug="alert-banner"
        onInsert={() => {}}
      />,
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
          content: Buffer.from(
            JSON.stringify({ media: { x: { default: "d" } } }),
          ).toString("base64"),
          encoding: "base64",
        },
      }),
    },
  } as any;
  render(
    wrap(
      <MediaPickerPopover octokit={gh} componentSlug="x" onInsert={() => {}} />,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /insert media/i }));
  assert.ok(await screen.findByText(/no captured media/i));
  cleanup();
});

test("discards an in-flight fetch when the component changes mid-load", async () => {
  globalThis.sessionStorage.clear();
  cleanup();
  const INDEX = {
    media: {
      a: {
        variations: ["components/dist/media/a/variations-0.webp"],
        default: "d",
      },
      b: {
        behavior: ["components/dist/media/b/behavior-0.webp"],
        default: "d",
      },
    },
  };
  const indexB64 = Buffer.from(JSON.stringify(INDEX)).toString("base64");
  const imgB64 = Buffer.from("img").toString("base64");
  let releaseIndex: (() => void) | null = null;
  const gated = new Promise<void>((res) => (releaseIndex = () => res()));
  let firstIndexFetch = true;
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/dist/media/_index.json") {
          if (firstIndexFetch) {
            firstIndexFetch = false;
            await gated; // hold the FIRST index fetch open
          }
          return { data: { content: indexB64, encoding: "base64" } };
        }
        return { data: { content: imgB64, encoding: "base64" } };
      },
    },
  } as any;

  const { rerender } = render(
    wrap(
      <MediaPickerPopover octokit={gh} componentSlug="a" onInsert={() => {}} />,
    ),
  );
  // Open while on "a" — the index fetch is gated (in flight).
  fireEvent.click(screen.getByRole("button", { name: /insert media/i }));
  // Navigate to "b" before the fetch resolves.
  rerender(
    wrap(
      <MediaPickerPopover octokit={gh} componentSlug="b" onInsert={() => {}} />,
    ),
  );
  // Now let "a"'s fetch resolve — its result must be DISCARDED.
  releaseIndex!();
  await new Promise((r) => setTimeout(r, 0));
  // Open the picker on "b": it must fetch + show b's role, never a's.
  fireEvent.click(screen.getByRole("button", { name: /insert media/i }));
  assert.ok(
    await screen.findByText(/Behavior/i),
    "shows b's role after the race",
  );
  assert.equal(
    screen.queryByText(/Variations/i),
    null,
    "stale a roles discarded",
  );
  cleanup();
});

test("re-fetches roles when componentSlug changes (no stale media)", async () => {
  globalThis.sessionStorage.clear();
  cleanup();
  const INDEX2 = {
    media: {
      a: {
        variations: ["components/dist/media/a/variations-0.webp"],
        default: "d",
      },
      b: {
        behavior: ["components/dist/media/b/behavior-0.webp"],
        default: "d",
      },
    },
  };
  const indexB64 = Buffer.from(JSON.stringify(INDEX2)).toString("base64");
  const imgB64 = Buffer.from("img").toString("base64");
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) =>
        path === "components/dist/media/_index.json"
          ? { data: { content: indexB64, encoding: "base64" } }
          : { data: { content: imgB64, encoding: "base64" } },
    },
  } as any;

  const { rerender } = render(
    wrap(
      <MediaPickerPopover octokit={gh} componentSlug="a" onInsert={() => {}} />,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /insert media/i }));
  assert.ok(await screen.findByText(/Variations/i), "shows A's role");

  // Navigate to component B (same instance — prop change, no remount).
  rerender(
    wrap(
      <MediaPickerPopover octokit={gh} componentSlug="b" onInsert={() => {}} />,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /insert media/i }));
  assert.ok(
    await screen.findByText(/Behavior/i),
    "shows B's role after slug change",
  );
  assert.equal(
    screen.queryByText(/Variations/i),
    null,
    "no stale A role for B",
  );
  cleanup();
});
