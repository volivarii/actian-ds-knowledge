import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { categoryDefaultsUiSchema } from "../../src/uiSchemas/categoryDefaults";

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
        return {
          data: { encoding: "base64", content: b64(files[path]!), sha: `sha-${path}` },
        };
      },
    },
  } as any;
}

const CAT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    _schema_version: { const: 2 },
    slug: { type: "string" },
    label: { type: "string", title: "Label" },
  },
});
const CAT_FILE =
  "---\n_schema_version: 2\nslug: action\nlabel: Action\n---\n\n# Action\n\n## Reference patterns\n\n* Polaris\n";

test("renders RichBodyEditor for a category when the wysiwyg flag is on", async () => {
  cleanup();
  globalThis.sessionStorage.setItem("editor.wysiwyg", "1");
  const gh = fakeGh({
    "schemas/category-defaults.json": CAT_SCHEMA,
    "components/src/categories/action.md": CAT_FILE,
  });
  render(
    <Theme>
      <FrontmatterBodyEditScreen
        path="components/src/categories/action.md"
        schemaKey="category-defaults"
        uiSchema={categoryDefaultsUiSchema}
        octokit={gh}
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
