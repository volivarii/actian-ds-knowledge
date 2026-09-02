import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";
import { fakeOctokit } from "../helpers/fakeOctokit";

// A passing unit test proves the WORDS changed in a module. It does not prove
// any screen renders them — the gap recorded in `feedback_ask_what_renders_this`,
// which has shipped invisible work twice. Nothing mounted an app-context record
// through its REAL uiSchema, so "Part of" was asserted nowhere a reader looks.
//
// This mounts the actual screen with the actual registry entry, no fixture
// schema and no `uiSchema={{}}`.

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

// happy-dom, not jsdom. Under `../setup-dom` every assertion in this file
// passed and the FILE still timed out — a leaked handle reads as a hang, not a
// failure. `appContextWysiwyg.test.tsx` mounts this same screen cleanly on
// happy-dom, so the environment is the difference, not the assertions.
//
// happy-dom does not install sessionStorage, which this screen reads.
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

const teardown = cleanup;

async function renderRecord(path: string, schemaFile: string, file: string) {
  const form = matchFrontmatterForm(path)!;
  assert.ok(form, `${path} has no frontmatter form registered`);
  const gh = fakeOctokit({
    [`schemas/${schemaFile}`]: readFileSync(
      resolve(REPO, "schemas", schemaFile),
      "utf8",
    ),
    [path]: file,
  });
  const r = render(
    <Theme>
      <FrontmatterBodyEditScreen
        path={path}
        schemaKey={form.schemaKey}
        uiSchema={form.uiSchema}
        bodyless={form.bodyless}
        yamlFlowAtDepth={form.flowAtDepth}
        preserveComments={form.preserveComments}
        frontmatterOptional={form.frontmatterOptional}
        surface={form.surface}
        octokit={gh as never}
      />
    </Theme>,
  );
  await waitFor(() => assert.ok(r.container.textContent!.includes("Frontmatter")), {
    timeout: 5000,
  });
  return r;
}

test("a Pattern's products render under the word Part of, not 'Appears in apps'", async () => {
  cleanup();
  const { container } = await renderRecord(
    "app-context/src/patterns/asset-detail-360.md",
    "app-context-pattern.json",
    "---\nslug: asset-detail-360\nlabel: 360-degree asset detail view\napps:\n  - studio\n---\nBody.\n",
  );
  await waitFor(() => assert.ok(container.textContent!.includes("Part of")), {
    timeout: 5000,
  });
  const txt = container.textContent!;
  assert.ok(!txt.includes("Appears in apps"), "retired label must not render");
  assert.ok(!txt.includes("Surfaced in apps"), "the Entity variant must not render either");
  teardown();
});

test("an Entity's products render under the same word as a Pattern's", async () => {
  // The defect: one field, two labels. A reader learning "Part of" on a Pattern
  // met "Surfaced in apps" on an Entity and had to learn it twice.
  cleanup();
  const { container } = await renderRecord(
    "app-context/src/entities/data-product.md",
    "app-context-entity.json",
    "---\nslug: data-product\nlabel: Data Product\napps:\n  - studio\n---\nBody.\n",
  );
  await waitFor(() => assert.ok(container.textContent!.includes("Part of")), {
    timeout: 5000,
  });
  assert.ok(!container.textContent!.includes("Surfaced in apps"));
  teardown();
});

test("a Product's name field says Product, not App", async () => {
  cleanup();
  const { container } = await renderRecord(
    "app-context/src/apps/studio.md",
    "app-context-app.json",
    "---\nslug: studio\nlabel: Studio\n---\n\n## Purpose\n\nGovernance.\n",
  );
  await waitFor(() => assert.ok(container.textContent!.includes("Product label")), {
    timeout: 5000,
  });
  assert.ok(
    !container.textContent!.includes("App label"),
    "the retired 'App label' must not render",
  );
  teardown();
});
