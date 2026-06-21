import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { appContextAppUiSchema } from "../../src/uiSchemas/appContextApp";

// happy-dom doesn't install sessionStorage; provide a minimal in-memory stub.
if (!globalThis.sessionStorage) {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    },
  });
}

function b64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}
function fakeGh(files: Record<string, string>) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (!(path in files)) {
          const e: any = new Error("not found");
          e.status = 404;
          throw e;
        }
        return { data: { encoding: "base64", content: b64(files[path]!) } };
      },
    },
  } as any;
}

const APP_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    _schema_version: { const: 1 },
    slug: { type: "string", title: "Slug" },
    label: { type: "string", title: "App label" },
    header: {
      type: "object",
      properties: { type: { type: "string", title: "Header type" } },
    },
    sidebar: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, id: { type: "string" } },
      },
    },
  },
});

const STUDIO_FILE =
  "---\n_schema_version: 1\nslug: studio\nlabel: Studio\nheader:\n  type: Studio\nsidebar: []\n---\n\n## Purpose\n\nGovernance\n\n## Users\n\n- Data steward\n";

test("renders RichBodyEditor when the wysiwyg flag is on", async () => {
  cleanup();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  const gh = fakeGh({
    "schemas/app-context-app.json": APP_SCHEMA,
    "app-context/src/apps/studio.md": STUDIO_FILE,
  });
  render(
    <Theme>
      <FrontmatterBodyEditScreen
        path="app-context/src/apps/studio.md"
        schemaKey="app-context-app"
        uiSchema={appContextAppUiSchema}
        octokit={gh}
        bodyless={false}
      />
    </Theme>,
  );
  await waitFor(
    () => assert.ok(screen.getByRole("textbox", { name: /body editor/i })),
    { timeout: 5000 },
  );
  globalThis.sessionStorage.clear();
  cleanup();
});
