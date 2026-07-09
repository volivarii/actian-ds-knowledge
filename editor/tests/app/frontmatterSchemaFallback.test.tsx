import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";

function b64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}
// getContent serves only the files given; any other path 404s (real GitHub
// behavior). Used to simulate a transient/absent schema fetch.
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

const CONTENT_PATH = "content/src/patterns/forms.md";
// A file WITH valid frontmatter — so the frontmatter check passes and the code
// proceeds to the schema fetch, which then fails.
const FILE = "---\ntitle: Forms\n---\n\nBody prose.\n";

test("schema-fetch failure degrades to raw editing, not a hard error banner", async () => {
  cleanup();
  submissionCartSingleton.clear();
  globalThis.sessionStorage.clear();

  // NOTE: no `schemas/content.json` entry → the schema fetch 404s.
  const gh = fakeGh({ [CONTENT_PATH]: { content: FILE, sha: "F1" } });

  render(
    <Theme>
      <FrontmatterBodyEditScreen
        path={CONTENT_PATH}
        schemaKey="content"
        uiSchema={{}}
        octokit={gh}
        preserveComments
      />
    </Theme>,
  );

  // The file must remain editable: MarkdownEditScreen renders the path.
  await waitFor(() => assert.ok(screen.getByText(CONTENT_PATH)), {
    timeout: 5000,
  });

  // It must NOT be the hard red error banner surfacing the raw 404 message.
  assert.equal(
    screen.queryByText(/not found/i),
    null,
    "schema-fetch failure must degrade gracefully, not show a hard error",
  );

  submissionCartSingleton.clear();
  cleanup();
});
