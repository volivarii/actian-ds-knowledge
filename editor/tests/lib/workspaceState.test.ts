import { test } from "node:test";
import assert from "node:assert/strict";
import {
  domainFileName,
  domainPathFor,
  validateCartCoupling,
} from "../../src/lib/workspaceState";
import { SubmissionCart } from "../../src/drafts/SubmissionCart";

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

// In-memory Storage so SubmissionCart works outside the browser.
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
  };
}

// Minimal Octokit stand-in: repos.getContent returns base64 file content
// for known paths, throws a 404-shaped error otherwise.
function fakeGh(files: Record<string, string>) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const content = files[path];
        if (content === undefined) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return { data: { content: b64(content), encoding: "base64" } };
      },
    },
  } as any;
}

// _meta.yml that declares ONLY the tokens domain as approved — the K1
// shape (tokens.yml bindings, no tokens.md, other domains untouched).
const META_TOKENS_APPROVED = `
component: "Button"
category: action
domains:
  content: { status: not-started }
  usage: { status: not-started }
  design: { status: inherited }
  behavior: { status: not-started }
  tokens: { status: approved }
`;

function cartWithMeta(content: string): SubmissionCart {
  const cart = new SubmissionCart(makeStorage());
  cart.add({
    path: "components/src/button/_meta.yml",
    content,
    basedOnSha: "",
    addedAt: 1,
  });
  return cart;
}

test("domainFileName: tokens is YAML-backed, others Markdown", () => {
  assert.equal(domainFileName("tokens"), "tokens.yml");
  assert.equal(domainFileName("content"), "content.md");
  assert.equal(domainFileName("usage"), "usage.md");
  assert.equal(domainFileName("design"), "design.md");
  assert.equal(domainFileName("behavior"), "behavior.md");
});

test("domainPathFor: tokens resolves to tokens.yml, others to <domain>.md", () => {
  assert.equal(
    domainPathFor("button", "tokens"),
    "components/src/button/tokens.yml",
  );
  assert.equal(
    domainPathFor("button", "content"),
    "components/src/button/content.md",
  );
  assert.equal(
    domainPathFor("text-input", "design"),
    "components/src/text-input/design.md",
  );
});

test("validateCartCoupling: approved tokens satisfied by tokens.yml on remote (no false mismatch)", async () => {
  // K1 component: _meta declares tokens approved, tokens.yml exists on
  // remote, no tokens.md. Must NOT flag declared-but-missing.
  const gh = fakeGh({
    "components/src/button/tokens.yml": "color-bg: --zen-color-bg-default\n",
  });
  const cart = cartWithMeta(META_TOKENS_APPROVED);
  const mismatches = await validateCartCoupling(gh, cart);
  assert.deepEqual(mismatches, []);
});

test("validateCartCoupling: approved tokens with neither tokens.yml on remote nor in cart → declared-but-missing", async () => {
  const gh = fakeGh({}); // nothing on remote
  const cart = cartWithMeta(META_TOKENS_APPROVED);
  const mismatches = await validateCartCoupling(gh, cart);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]!.domain, "tokens");
  assert.equal(mismatches[0]!.kind, "declared-but-missing");
  assert.equal(mismatches[0]!.declaredStatus, "approved");
});
