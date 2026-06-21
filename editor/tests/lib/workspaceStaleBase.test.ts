import { test } from "node:test";
import assert from "node:assert/strict";
import {
  promoteDomainToDraft,
  stageMetadataForEdit,
} from "../../src/lib/workspaceState";
import { SubmissionCart } from "../../src/drafts/SubmissionCart";

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  } as Storage;
}

// fakeGh whose getContent reports a blob `sha` (real GitHub always does).
function fakeGh(files: Record<string, { content: string; sha: string }>) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const f = files[path];
        if (f === undefined) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return { data: { content: b64(f.content), encoding: "base64", sha: f.sha } };
      },
    },
  } as any;
}

const META_PATH = "components/src/button/_meta.yml";
const META_SHA = "WS_META_SHA_1";
const META = `
component: "Button"
category: action
domains:
  content: { status: not-started }
  usage: { status: not-started }
  design: { status: inherited }
  behavior: { status: not-started }
  tokens: { status: approved }
`;

test("stageMetadataForEdit stages an existing remote _meta.yml with the remote blob sha", async () => {
  const cart = new SubmissionCart(makeStorage());
  const gh = fakeGh({ [META_PATH]: { content: META, sha: META_SHA } });

  await stageMetadataForEdit(gh, "button", cart);

  const entry = cart.list().find((e) => e.path === META_PATH);
  assert.ok(entry, "_meta.yml should be staged");
  assert.equal(
    entry!.basedOnSha,
    META_SHA,
    "workspace-staged _meta.yml must carry the remote blob sha, not an empty base",
  );
});

test("promoteDomainToDraft preserves the remote blob sha when re-staging the edited meta", async () => {
  const cart = new SubmissionCart(makeStorage());
  const gh = fakeGh({ [META_PATH]: { content: META, sha: META_SHA } });

  await promoteDomainToDraft(gh, "button", "content", cart);

  const entry = cart.list().find((e) => e.path === META_PATH);
  assert.ok(entry, "_meta.yml should be staged after promote");
  assert.match(
    entry!.content,
    /content:\s*\{?[^}]*status:\s*draft/,
    "content domain should be promoted to draft (sanity: the edit happened)",
  );
  assert.equal(
    entry!.basedOnSha,
    META_SHA,
    "the re-staged edit must keep the remote blob sha, not reset to an empty base",
  );
});

test("staging a brand-new (404) _meta.yml stub keeps an empty base", async () => {
  const cart = new SubmissionCart(makeStorage());
  // No meta on remote; registry lookup also 404s → buildStubMetaContent path.
  const gh = fakeGh({});

  await stageMetadataForEdit(gh, "button", cart);

  const entry = cart.list().find((e) => e.path === META_PATH);
  assert.ok(entry, "a stub _meta.yml should be staged for a new component");
  assert.equal(
    entry!.basedOnSha,
    "",
    "a brand-new file has no remote base to be stale against",
  );
});
