import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";
import { detectStaleBase } from "../../src/core/staleBase";

function b64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

// fakeGh whose getContent reports a blob `sha` (real GitHub always does). The
// remote-load path of FrontmatterBodyEditScreen must capture it so staged edits
// carry a non-empty basedOnSha.
function fakeGh(files: Record<string, { content: string; sha: string }>) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (!(path in files)) {
          const e: any = new Error("not found");
          e.status = 404;
          throw e;
        }
        const f = files[path]!;
        return {
          data: { encoding: "base64", content: b64(f.content), sha: f.sha },
        };
      },
    },
  } as any;
}

const SCHEMA = JSON.stringify({
  type: "object",
  properties: { label: { type: "string", title: "App label" } },
});

const ENTITY_PATH = "app-context/src/entities/dataset.md";
const REMOTE_SHA = "ENTITY_SHA_1";

// This test renders FrontmatterBodyEditScreen without `surface`, so it
// exercises the RJSF branch directly. Production now always routes
// app-context paths through surface="yaml" (frontmatterForms.ts), so this
// is no longer coverage of what app-context users actually get — it still
// guards the #280 no-silent-overwrite guarantee for the RJSF component
// itself, which the other three form domains (content, foundations,
// categories, words-to-avoid) still use. See
// FrontmatterYamlSurface.test.tsx's "byte-identical content" test for the
// routed-path equivalent of this basedOnSha assertion.
test("staging an app-context record carries the remote blob sha (stale-base detectable)", async () => {
  cleanup();
  submissionCartSingleton.clear();
  globalThis.sessionStorage.clear();

  const gh = fakeGh({
    "schemas/app-context-entity.json": { content: SCHEMA, sha: "SCHEMA_SHA" },
    [ENTITY_PATH]: { content: "---\nlabel: Dataset\n---\nprose body\n", sha: REMOTE_SHA },
  });

  const { container } = render(
    <Theme>
      <FrontmatterBodyEditScreen
        path={ENTITY_PATH}
        schemaKey="app-context-entity"
        uiSchema={{}}
        octokit={gh}
      />
    </Theme>,
  );

  await waitFor(() => assert.ok(screen.queryByText("Prose body")), {
    timeout: 5000,
  });

  // Stage the record ("Add to batch" → RJSF onSubmit → flushToCart).
  const form = container.querySelector("form");
  assert.ok(form, "expected an RJSF form to be rendered");
  await act(async () => {
    fireEvent.submit(form!);
  });

  const entry = submissionCartSingleton.list().find((e) => e.path === ENTITY_PATH);
  assert.ok(entry, "record should be staged in the submission cart");
  assert.equal(
    entry!.basedOnSha,
    REMOTE_SHA,
    "staged edit must carry the remote blob sha, not an empty base",
  );

  // The staged entry must now be visible to detectStaleBase: a drifted remote
  // yields a conflict instead of being silently skipped (empty-base path).
  const driftedGh = {
    repos: {
      getContent: async () => ({
        data: { sha: "ENTITY_SHA_2_DRIFTED", content: b64("changed") },
      }),
    },
  } as any;
  const conflicts = await detectStaleBase(
    [{ path: entry!.path, content: entry!.content, basedOnSha: entry!.basedOnSha }],
    driftedGh,
    { owner: "o", repo: "r", base: "main" },
  );
  assert.equal(conflicts.length, 1, "stale base must be detected for the record");
  assert.equal(conflicts[0]!.path, ENTITY_PATH);

  submissionCartSingleton.clear();
  cleanup();
});
