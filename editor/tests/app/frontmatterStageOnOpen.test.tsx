import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { setWysiwygFlag } from "../helpers/editorSurface";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";

// Sub-task 1114 (finding F15): opening a file must stage nothing. Only a real
// change stages a draft or adds the file to the batch. Live in production
// since the addresses shipped (#619): every deep link quietly filled the
// author's outbox with byte-identical "edits".

// happy-dom lacks sessionStorage/localStorage: minimal in-memory stubs.
for (const key of ["sessionStorage", "localStorage"] as const) {
  if (!(globalThis as any)[key]) {
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, key, {
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
}

// happy-dom lacks the observers the real content widgets (Radix) touch.
for (const name of ["ResizeObserver", "IntersectionObserver"] as const) {
  if (!(globalThis as any)[name]) {
    (globalThis as any)[name] = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
function fakeGh(files: Record<string, string>) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (!(path in files)) {
          const e: any = new Error("not found");
          e.status = 404;
          throw e;
        }
        return { data: { encoding: "base64", content: b64(files[path]!), sha: `sha-${path}` } };
      },
    },
    git: {},
    pulls: {},
  } as any;
}

// The REAL schema, the REAL file and the REAL form routing: a component test
// with a toy schema proved nothing about what production stages on open.
const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const SCHEMA = readFileSync(resolve(REPO, "schemas/content.json"), "utf8");
// A rich-safe content path (src/generated/wysiwyg-safe-paths.json), so the
// rich editor mounts when the flag is on.
const FORM_PATH = "content/src/patterns/forms.md";
const FORM_FILE = readFileSync(resolve(REPO, FORM_PATH), "utf8");
const FORM = matchFrontmatterForm(FORM_PATH)!;
const formProps = {
  schemaKey: FORM.schemaKey,
  uiSchema: FORM.uiSchema,
  bodyless: FORM.bodyless,
  yamlFlowAtDepth: FORM.flowAtDepth,
  preserveComments: FORM.preserveComments,
  frontmatterOptional: FORM.frontmatterOptional,
  surface: FORM.surface,
};
const PLAIN_PATH = "content/src/global-guidelines.md";
const PLAIN_FILE = "## Heading {#h}\n\nProse.\n";
const DEBOUNCE_AND_MARGIN = 1600;

async function stores() {
  const m = await import("../../src/drafts/store-instance");
  return m;
}
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, DEBOUNCE_AND_MARGIN)));

test("opening a frontmatter file in the rich editor stages nothing", async () => {
  cleanup();
  setWysiwygFlag("rich");
  const { submissionCartSingleton, draftStoreSingleton } = await stores();
  submissionCartSingleton.clear();
  const { FrontmatterBodyEditScreen } = await import("../../src/app/FrontmatterBodyEditScreen");
  render(
    <Theme>
      <FrontmatterBodyEditScreen path={FORM_PATH} {...formProps} octokit={fakeGh({ "schemas/content.json": SCHEMA, [FORM_PATH]: FORM_FILE })} />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.getByRole("textbox", { name: /body editor/i })), { timeout: 8000 });
  await settle();
  assert.equal(submissionCartSingleton.list().find((e) => e.path === FORM_PATH), undefined, "nothing typed, nothing in the batch");
  assert.ok(!draftStoreSingleton.allPaths().has(FORM_PATH), "nothing typed, no draft");
  cleanup();
});

test("opening a frontmatter file in the source editor stages nothing", async () => {
  cleanup();
  setWysiwygFlag("source");
  const { submissionCartSingleton, draftStoreSingleton } = await stores();
  submissionCartSingleton.clear();
  const { FrontmatterBodyEditScreen } = await import("../../src/app/FrontmatterBodyEditScreen");
  render(
    <Theme>
      <FrontmatterBodyEditScreen path={FORM_PATH} {...formProps} octokit={fakeGh({ "schemas/content.json": SCHEMA, [FORM_PATH]: FORM_FILE })} />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.getByText("Prose body")), { timeout: 8000 });
  await settle();
  assert.equal(submissionCartSingleton.list().find((e) => e.path === FORM_PATH), undefined, "nothing typed, nothing in the batch");
  assert.ok(!draftStoreSingleton.allPaths().has(FORM_PATH), "nothing typed, no draft");
  cleanup();
});

test("a real change to the frontmatter form still stages after the debounce (control)", async () => {
  cleanup();
  setWysiwygFlag("source");
  const { submissionCartSingleton } = await stores();
  submissionCartSingleton.clear();
  const { FrontmatterBodyEditScreen } = await import("../../src/app/FrontmatterBodyEditScreen");
  render(
    <Theme>
      <FrontmatterBodyEditScreen path={FORM_PATH} {...formProps} octokit={fakeGh({ "schemas/content.json": SCHEMA, [FORM_PATH]: FORM_FILE })} />
    </Theme>,
  );
  const input = (await screen.findByLabelText(/title/i, {}, { timeout: 8000 })) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value: "Forms, revised" } });
  });
  await settle();
  const entry = submissionCartSingleton.list().find((e) => e.path === FORM_PATH);
  assert.ok(entry, "a typed change reaches the batch");
  assert.ok(entry!.content.includes("Forms, revised"));
  cleanup();
});

test("opening a plain markdown file in the rich editor creates no draft", async () => {
  cleanup();
  setWysiwygFlag("rich");
  const { submissionCartSingleton, draftStoreSingleton } = await stores();
  submissionCartSingleton.clear();
  draftStoreSingleton.clear(PLAIN_PATH);
  const { MarkdownEditScreen } = await import("../../src/app/MarkdownEditScreen");
  render(
    <Theme>
      <MarkdownEditScreen path={PLAIN_PATH} octokit={fakeGh({ [PLAIN_PATH]: PLAIN_FILE })} />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.getByRole("textbox", { name: /body editor/i })), { timeout: 8000 });
  await settle();
  assert.ok(!draftStoreSingleton.allPaths().has(PLAIN_PATH), "nothing typed, no draft");
  assert.equal(submissionCartSingleton.list().find((e) => e.path === PLAIN_PATH), undefined);
  cleanup();
});

test("a change typed and then reverted leaves the batch: the file is back to what was loaded", async () => {
  cleanup();
  setWysiwygFlag("source");
  const { submissionCartSingleton } = await stores();
  submissionCartSingleton.clear();
  const { FrontmatterBodyEditScreen } = await import("../../src/app/FrontmatterBodyEditScreen");
  render(
    <Theme>
      <FrontmatterBodyEditScreen path={FORM_PATH} {...formProps} octokit={fakeGh({ "schemas/content.json": SCHEMA, [FORM_PATH]: FORM_FILE })} />
    </Theme>,
  );
  const input = (await screen.findByLabelText(/^title/i, {}, { timeout: 8000 })) as HTMLInputElement;
  const original = input.value;
  await act(async () => {
    fireEvent.change(input, { target: { value: original + " (edited)" } });
  });
  await settle();
  assert.ok(submissionCartSingleton.list().find((e) => e.path === FORM_PATH), "the edit is staged");
  await act(async () => {
    fireEvent.change(input, { target: { value: original } });
  });
  await settle();
  assert.equal(submissionCartSingleton.list().find((e) => e.path === FORM_PATH), undefined, "reverted to the loaded bytes: not a change, not in the batch");
  cleanup();
});
