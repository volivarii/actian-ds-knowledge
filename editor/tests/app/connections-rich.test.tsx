import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Theme } from "@radix-ui/themes";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { appContextPatternUiSchema } from "../../src/uiSchemas/appContextPattern";
import { setWysiwygFlag } from "../helpers/editorSurface";
import { fakeOctokit } from "../helpers/fakeOctokit";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const real = (rel: string) => readFileSync(join(REPO, rel), "utf8");

test("in the rich editor, turning a mention into a link shows the link in the body", async () => {
  cleanup();
  setWysiwygFlag("rich");
  const path = "app-context/src/patterns/asset-detail-360.md";
  const gh = fakeOctokit({
    [path]: real(path),
    "schemas/app-context-pattern.json": real("schemas/app-context-pattern.json"),
  });
  try {
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
    await screen.findByRole("heading", { name: "Connections" }, { timeout: 8000 });
    await waitFor(() => assert.ok(screen.getByRole("textbox", { name: /body editor/i })), { timeout: 8000 });
    fireEvent.click(screen.getByRole("button", { name: /^Faceted browse/ }));
    fireEvent.click(screen.getByRole("button", { name: "Turn it into a link" }));
    await waitFor(
      () => {
        const editor = screen.getByRole("textbox", { name: /body editor/i });
        const link = [...editor.querySelectorAll("a")].find((a) => a.textContent === "faceted browse");
        assert.ok(link, "no 'faceted browse' link in the rich body");
      },
      { timeout: 8000 },
    );
  } finally {
    cleanup();
    globalThis.localStorage?.clear?.();
    globalThis.sessionStorage?.clear?.();
  }
});
