import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import React from "react";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { AuthoringWorkspace } from "../../src/app/AuthoringWorkspace";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { appContextPatternUiSchema } from "../../src/uiSchemas/appContextPattern";
import { setWysiwygFlag } from "../helpers/editorSurface";

// Mount-level: the section must render through each screen's loading gate, on
// the page, not only when the component is invoked directly (#435's lesson).

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const real = (rel: string) => readFileSync(join(REPO, rel), "utf8");

function fakeGh(files: Record<string, string>) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const c = files[path];
        if (c === undefined) {
          const e = new Error("not found") as Error & { status: number };
          e.status = 404;
          throw e;
        }
        return { data: { content: Buffer.from(c).toString("base64"), encoding: "base64", sha: `sha-${path}` } };
      },
      listCommits: async () => ({ data: [] }),
    },
  } as any;
}

beforeEach(() => {
  globalThis.sessionStorage.clear();
  globalThis.localStorage.clear();
});
afterEach(() => cleanup());

test("the component page renders Connections through its loading gate", async () => {
  const gh = fakeGh({
    "components/src/button/_meta.yml":
      'component: "Button"\ncategory: action\na11y_refs:\n  - { ref: buttons }\ndomains:\n  usage: { status: approved }\n',
    "components/src/button/usage.md": "Use a [table](table) or a [tip](tooltip).\n",
    "paths-manifest.json": JSON.stringify({ knowledge_version: "0.34.217" }),
  });
  render(
    <Theme>
      <AuthoringWorkspace slug="button" octokit={gh} onNavigate={() => {}} onBack={() => {}} />
    </Theme>,
  );
  const h = await screen.findByRole("heading", { name: "Connections" }, { timeout: 5000 });
  assert.ok(!h.closest("[hidden]"), "the section sits inside a hidden element");
  assert.ok(await screen.findByText("Must follow, via Action"));
  assert.ok(screen.getByText("Mentioned in guidance"));
});

test("the pattern page renders Connections, with its components and the patterns its text names", async () => {
  setWysiwygFlag("source");
  const path = "app-context/src/patterns/asset-detail-360.md";
  const gh = fakeGh({
    [path]: real(path),
    "schemas/app-context-pattern.json": real("schemas/app-context-pattern.json"),
  });
  render(
    <Theme>
      <FrontmatterBodyEditScreen
        path={path}
        schemaKey="app-context-pattern"
        uiSchema={appContextPatternUiSchema}
        octokit={gh}
        bodyless={false}
        surface="yaml"
        preserveComments
      />
    </Theme>,
  );
  const h = await screen.findByRole("heading", { name: "Connections" }, { timeout: 5000 });
  assert.ok(!h.closest("[hidden]"), "the section sits inside a hidden element");
  await waitFor(() => assert.ok(screen.getByText("Named in the text")));
  assert.match(h.closest("section")!.textContent!, /25 in \d+ kinds/);
});
