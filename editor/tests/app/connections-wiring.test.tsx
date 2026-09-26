import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import React from "react";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
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

function renderPattern() {
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
}

test("on the pattern page, adding a component through Connections becomes a pending change", async () => {
  renderPattern();
  await screen.findByRole("heading", { name: "Connections" }, { timeout: 5000 });
  fireEvent.click(screen.getByRole("button", { name: "+ Connect" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Connect" })).getByRole("button", { name: /Built from/ }));
  const box = screen.getByRole("combobox", { name: /Find a component/ });
  fireEvent.change(box, { target: { value: "toggl" } });
  fireEvent.keyDown(box, { key: "Enter" });
  await waitFor(() => assert.ok(screen.getByText(/1 change not saved yet/)));
  assert.ok(screen.getByRole("button", { name: /^Toggle.*new/ }));
});

test("with the YAML source open, Connections is read-only and says why", async () => {
  renderPattern();
  await screen.findByRole("heading", { name: "Connections" }, { timeout: 5000 });
  fireEvent.click(screen.getByRole("button", { name: "View source" }));
  await waitFor(() => assert.ok(screen.getAllByText(/Close the YAML source to edit connections/).length > 0));
  assert.ok(!screen.queryByRole("button", { name: "+ Connect" }), "+ Connect shown while the source is open");
});

test("on the component page, adding a rule stages _meta.yml and shows as pending", async () => {
  const gh = fakeGh({
    "components/src/button/_meta.yml":
      'component: "Button"\ncategory: action\na11y_refs:\n  - { ref: buttons }\ndomains:\n  usage: { status: approved }\n',
    "paths-manifest.json": JSON.stringify({ knowledge_version: "0.34.217" }),
  });
  render(
    <Theme>
      <AuthoringWorkspace slug="button" octokit={gh} onNavigate={() => {}} onBack={() => {}} />
    </Theme>,
  );
  await screen.findByRole("heading", { name: "Connections" }, { timeout: 5000 });
  const lane = screen.getByRole("group", { name: "Must follow" });
  fireEvent.click(within(lane).getByRole("button", { name: "+ Add" }));
  const box = screen.getByRole("combobox", { name: /Find a/ });
  fireEvent.change(box, { target: { value: "tooltips" } });
  // "Must follow" offers criteria, foundations and motion; pick the criterion.
  const criterion = screen.getAllByRole("option").find((o) => /^Tooltips.*Criterion$/.test(o.textContent ?? ""));
  assert.ok(criterion, "the Tooltips criterion is offered");
  fireEvent.mouseDown(criterion!);
  await waitFor(() => assert.ok(screen.getByText(/1 change not saved yet/)), { timeout: 5000 });
  const staged = globalThis.localStorage.getItem("editor:submission-cart:v1") ?? "";
  assert.match(staged, /a11y_refs:\\n  - \{ ref: buttons \}\\n  - \{ ref: tooltips \}/);
});
