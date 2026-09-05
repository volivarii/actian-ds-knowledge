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
  try {
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
  } finally {
    // In a finally, not as the last statement: a failing assertion used to
    // leave the tree mounted, and this file's whole reason for existing is
    // that a leaked handle reads as a 60s hang rather than a message.
    cleanup();
  }
});

test("an Entity's products render under the same word as a Pattern's", async () => {
  // The defect: one field, two labels. A reader learning "Part of" on a Pattern
  // met "Surfaced in apps" on an Entity and had to learn it twice.
  cleanup();
  try {
  const { container } = await renderRecord(
    "app-context/src/entities/data-product.md",
    "app-context-entity.json",
    "---\nslug: data-product\nlabel: Data Product\napps:\n  - studio\n---\nBody.\n",
  );
  await waitFor(() => assert.ok(container.textContent!.includes("Part of")), {
    timeout: 5000,
  });
  assert.ok(!container.textContent!.includes("Surfaced in apps"));
  } finally {
    // In a finally, not as the last statement: a failing assertion used to
    // leave the tree mounted, and this file's whole reason for existing is
    // that a leaked handle reads as a 60s hang rather than a message.
    cleanup();
  }
});

test("a Product's name field says Product, not App", async () => {
  cleanup();
  try {
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
  } finally {
    // In a finally, not as the last statement: a failing assertion used to
    // leave the tree mounted, and this file's whole reason for existing is
    // that a leaked handle reads as a 60s hang rather than a message.
    cleanup();
  }
});

test("no app-context form shows an author the schema's machine prose (#646)", async () => {
  // Found by LOOKING at the deployed editor, not by a test: under the field
  // captioned "Part of" an author was reading "App slugs where this UX pattern
  // appears", and under the components field "projected to the graph as
  // ux_pattern -> component 'uses_component' edges". RJSF falls back to the
  // SCHEMA's description when the uiSchema gives none, and the schema is a
  // machine contract. The nomenclature guard walks editor/src, and these
  // strings live in schemas/, one layer below where it reaches.
  //
  // The schema prose is not touched: presentation hints belong to the consumer
  // (editor/README.md, P3). This asserts the RENDER, because a uiSchema
  // constant asserted in isolation proves the words changed in a module and
  // never that a screen shows them.
  cleanup();
  try {
    const { container } = await renderRecord(
      "app-context/src/patterns/asset-detail-360.md",
      "app-context-pattern.json",
      "---\nslug: asset-detail-360\nlabel: 360-degree asset detail view\napps:\n  - studio\ncomponents:\n  - tabs\ntags:\n  - detail\n---\nBody.\n",
    );
    await waitFor(
      () => assert.ok(container.textContent!.includes("Part of")),
      { timeout: 5000 },
    );
    const txt = container.textContent!;

    // The author's words are what renders.
    assert.ok(
      txt.includes("The products where this page shape appears."),
      "the authored help for Part of does not render",
    );
    assert.ok(
      txt.includes("The design system components this page shape is built from."),
      "the authored help for the components field does not render",
    );

    // And the machine prose does not. Matched on SHAPE as well as on the two
    // sentences, so a schema reworded tomorrow into different jargon still
    // fails: a snake_case token is a graph edge type or a field name, and
    // neither is something an author writing English should be shown.
    for (const gone of [
      "App slugs where this UX pattern appears",
      "Registry-key slugs",
      "uses_component",
    ]) {
      assert.ok(!txt.includes(gone), `machine prose still renders: ${gone}`);
    }
    const snake = txt.match(/\b[a-z]+_[a-z]+(?:_[a-z]+)*\b/);
    assert.equal(
      snake && snake[0] !== "_schema_version" ? snake[0] : null,
      null,
      `a snake_case token reached the author: ${snake?.[0]}`,
    );
  } finally {
    cleanup();
  }
});

test("an Entity's fields carry the same author-facing help (#646)", async () => {
  cleanup();
  try {
    const { container } = await renderRecord(
      "app-context/src/entities/data-product.md",
      "app-context-entity.json",
      "---\nslug: data-product\nlabel: Data Product\napps:\n  - studio\n---\nBody.\n",
    );
    await waitFor(
      () => assert.ok(container.textContent!.includes("Part of")),
      { timeout: 5000 },
    );
    const txt = container.textContent!;
    assert.ok(
      txt.includes("The products where this thing is surfaced."),
      "the authored help for Part of does not render on an Entity",
    );
    assert.ok(
      !txt.includes("App slugs where this entity is surfaced"),
      "the schema's machine prose still renders on an Entity",
    );
  } finally {
    cleanup();
  }
});
