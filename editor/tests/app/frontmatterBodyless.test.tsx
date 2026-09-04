import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";

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
const SCHEMA = JSON.stringify({
  type: "object",
  properties: { label: { type: "string", title: "App label" } },
});

test("bodyless hides the Prose body editor", async () => {
  cleanup();
  globalThis.sessionStorage.clear();
  const gh = fakeGh({
    "schemas/app-context-app.json": SCHEMA,
    "app-context/src/apps/studio.md": "---\nlabel: Studio\n---\n",
  });
  render(
    <Theme>
      <FrontmatterBodyEditScreen
        path="app-context/src/apps/studio.md"
        schemaKey="app-context-app"
        uiSchema={{}}
        octokit={gh}
        bodyless
      />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.queryByText("App label")), {
    timeout: 5000,
  });
  assert.equal(
    screen.queryByText("Prose body"),
    null,
    "no body editor when bodyless",
  );
  cleanup();
});

test("the screen titles itself with one h1", async () => {
  // This screen had no heading at all, so app-context and category records
  // had no page title in the outline while every other screen had one.
  cleanup();
  globalThis.sessionStorage.clear();
  const gh = fakeGh({
    "schemas/app-context-app.json": SCHEMA,
    "app-context/src/apps/studio.md": "---\nlabel: Studio\n---\n",
  });
  render(
    <Theme>
      <FrontmatterBodyEditScreen
        path="app-context/src/apps/studio.md"
        schemaKey="app-context-app"
        uiSchema={{}}
        octokit={gh}
        bodyless
      />
    </Theme>,
  );
  await waitFor(() => assert.ok(document.querySelector("h1")), { timeout: 5000 });
  const h1s = document.querySelectorAll("h1");
  assert.equal(h1s.length, 1);
  assert.match(h1s[0]!.textContent ?? "", /studio\.md/);
});

test("default (bodyless false) shows the Prose body editor", async () => {
  cleanup();
  globalThis.sessionStorage.clear();
  const gh = fakeGh({
    "schemas/app-context-entity.json": SCHEMA,
    "app-context/src/entities/x.md": "---\nlabel: X\n---\nprose\n",
  });
  render(
    <Theme>
      <FrontmatterBodyEditScreen
        path="app-context/src/entities/x.md"
        schemaKey="app-context-entity"
        uiSchema={{}}
        octokit={gh}
      />
    </Theme>,
  );
  await waitFor(
    () =>
      assert.ok(
        screen.queryByText("Prose body"),
        "body editor present by default",
      ),
    { timeout: 5000 },
  );
  cleanup();
});
