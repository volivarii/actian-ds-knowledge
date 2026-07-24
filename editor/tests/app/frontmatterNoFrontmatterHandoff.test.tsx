import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";
import { setWysiwygFlag } from "../helpers/editorSurface";

function b64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

// A prose (optional-frontmatter) file with NO `---` fence. It must open
// silently in the markdown editor, and the blob must be fetched only ONCE:
// FrontmatterBodyEditScreen reads it to classify, then hands the already-loaded
// blob to MarkdownEditScreen via `preloaded` instead of triggering a second
// getContent for the same path (the Task-4 double-fetch this cleanup removes).
const CONTENT_PATH = "content/src/patterns/forms.md";
const NO_FENCE = "# Forms\n\nJust prose, no frontmatter.\n";

test("no-frontmatter prose file opens silently and fetches the blob only once", async () => {
  cleanup();
  submissionCartSingleton.clear();
  setWysiwygFlag("source");

  let blobFetches = 0;
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === CONTENT_PATH) {
          blobFetches++;
          return {
            data: { encoding: "base64", content: b64(NO_FENCE), sha: "SHA1" },
          };
        }
        // Any other path (anchor index, schema, …) 404s — irrelevant here.
        const e = new Error("not found") as Error & { status: number };
        e.status = 404;
        throw e;
      },
    },
  } as unknown as Parameters<typeof FrontmatterBodyEditScreen>[0]["octokit"];

  render(
    <Theme>
      <FrontmatterBodyEditScreen
        path={CONTENT_PATH}
        schemaKey="content"
        uiSchema={{}}
        octokit={gh}
        preserveComments
        frontmatterOptional
      />
    </Theme>,
  );

  // MarkdownEditScreen renders the path heading → the silent handoff happened.
  await waitFor(() => assert.ok(screen.getByText(CONTENT_PATH)), {
    timeout: 5000,
  });
  // No amber parse-error banner for a prose file that simply has no frontmatter.
  assert.equal(screen.queryByText(/Couldn't parse this file's frontmatter/i), null);

  assert.equal(
    blobFetches,
    1,
    `expected exactly ONE blob fetch for ${CONTENT_PATH}, got ${blobFetches}`,
  );

  submissionCartSingleton.clear();
  cleanup();
});
