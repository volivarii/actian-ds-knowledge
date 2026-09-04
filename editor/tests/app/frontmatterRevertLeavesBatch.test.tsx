import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { setWysiwygFlag } from "../helpers/editorSurface";
import { fakeOctokit as fakeGh } from "../helpers/fakeOctokit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";

// #631: 30 of 96 form-routed files are not byte fixed points of their own save
// path. For those, the "did anything change" test compared the assembled file
// with the bytes on main, which the save path cannot reproduce, so a file typed
// and then typed BACK stayed in the batch as a whitespace-only reflow.
//
// The fixture is a REAL file the serializer cannot re-emit, not a toy: entities
// are authored with padded flow maps (`{ name: orphan, ... }`) beside unpadded
// flow seqs (`[Present, Orphan]`), and `flowCollectionPadding` is one boolean
// for both, so no setting of it reproduces these bytes. Measured 2026-09-04:
// 29 of 89 comment-preserving files, 19 of them fixed by NO option.
const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const PATH = "app-context/src/entities/dataset.md";
const FILE = readFileSync(resolve(REPO, PATH), "utf8");
const SCHEMA = readFileSync(resolve(REPO, "schemas/app-context-entity.json"), "utf8");
const FORM = matchFrontmatterForm(PATH)!;
const formProps = {
  schemaKey: FORM.schemaKey,
  uiSchema: FORM.uiSchema,
  bodyless: FORM.bodyless,
  yamlFlowAtDepth: FORM.flowAtDepth,
  preserveComments: FORM.preserveComments,
  frontmatterOptional: FORM.frontmatterOptional,
  surface: FORM.surface,
};
const DEBOUNCE_AND_MARGIN = 1100;
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, DEBOUNCE_AND_MARGIN)));

async function cart() {
  return (await import("../../src/drafts/store-instance")).submissionCartSingleton;
}

test("a field edited and typed back leaves the batch, for a record the serializer cannot re-emit byte for byte", async () => {
  cleanup();
  setWysiwygFlag("source");
  const submissionCart = await cart();
  submissionCart.clear();
  const { FrontmatterBodyEditScreen } = await import("../../src/app/FrontmatterBodyEditScreen");
  render(
    <Theme>
      <FrontmatterBodyEditScreen
        path={PATH}
        {...formProps}
        octokit={fakeGh({ "schemas/app-context-entity.json": SCHEMA, [PATH]: FILE })}
      />
    </Theme>,
  );
  const label = await waitFor(
    () => {
      const el = document.getElementById("root_label") as HTMLInputElement | null;
      assert.ok(el, "the entity form never rendered its label field");
      return el!;
    },
    { timeout: 8000 },
  );
  const originalLabel = label.value;
  assert.equal(originalLabel, "Dataset", `unexpected fixture label: ${originalLabel}`);

  // A real edit stages it.
  fireEvent.change(label, { target: { value: "Datasets" } });
  await settle();
  assert.ok(
    submissionCart.list().some((e) => e.path === PATH),
    "a real edit did not reach the batch",
  );

  // Typed back to what was loaded: there is nothing left to submit.
  fireEvent.change(label, { target: { value: originalLabel } });
  await settle();
  assert.equal(
    submissionCart.list().find((e) => e.path === PATH),
    undefined,
    "a reverted edit stayed in the batch as a whitespace-only reflow (#631)",
  );
  cleanup();
});
