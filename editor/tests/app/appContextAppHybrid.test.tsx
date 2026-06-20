import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { appContextAppUiSchema } from "../../src/uiSchemas/appContextApp";

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

// Core-only app schema (post-Phase-1 shape: no purpose/users/signals).
const CORE_SCHEMA = JSON.stringify({
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

const ENUM_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    label: { type: "string", title: "App label" },
    header: {
      type: "object",
      properties: {
        type: {
          type: "string",
          title: "Header type",
          enum: ["Studio", "Explorer", "Admin"],
        },
      },
    },
  },
});

test("app renders the markdown body editor (not bodyless)", async () => {
  cleanup();
  globalThis.sessionStorage.clear();
  const gh = fakeGh({
    "schemas/app-context-app.json": CORE_SCHEMA,
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
  await waitFor(() => assert.ok(screen.queryByText("App label")), {
    timeout: 5000,
  });
  assert.ok(
    screen.queryByText("Prose body"),
    "app shows the markdown body editor",
  );
  cleanup();
});

test("header.type renders as a dropdown with the known variants", async () => {
  cleanup();
  globalThis.sessionStorage.clear();
  const gh = fakeGh({
    "schemas/app-context-app.json": ENUM_SCHEMA,
    "app-context/src/apps/studio.md":
      "---\nlabel: Studio\nheader:\n  type: Studio\n---\n\n## Purpose\n\nx\n",
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
    () => assert.ok(screen.queryByRole("combobox"), "header renders a select"),
    { timeout: 5000 },
  );
  assert.ok(
    screen.queryByText("Explorer"),
    "dropdown lists the Explorer option",
  );
  cleanup();
});
