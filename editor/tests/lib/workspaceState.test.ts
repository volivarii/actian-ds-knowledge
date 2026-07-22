import { test } from "node:test";
import assert from "node:assert/strict";
import {
  domainFileForPath,
  domainFileName,
  domainPathFor,
  promoteDomainToDraft,
  readDeclaredStatus,
  setDomainInherited,
  setDomainStatus,
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
        // Real GitHub always reports a blob sha; model it so staging paths
        // (which require a string basedOnSha) behave as in production.
        return {
          data: {
            content: b64(content),
            encoding: "base64",
            sha: `sha-${path}`,
          },
        };
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

// A realistic remote _meta.yml: leading schema header + flow-style domains,
// the on-disk shape every component currently ships. The editor must preserve
// this flow style on rewrite to keep the file byte-stable (the derive parser,
// scripts/lib/frontmatter, accepts both styles). behavior starts not-started so
// promoteDomainToDraft has something to promote.
const META_WITH_HEADER = `# yaml-language-server: $schema=../../../schemas/guideline-meta.json
component: "Buttons"
category: action
a11y_refs:
  - { ref: buttons }
domains:
  content: { status: approved, owner: content-team }
  usage: { status: not-started }
  design: { status: inherited }
  behavior: { status: not-started }
  tokens: { status: approved }
`;

test("promoteDomainToDraft rewrites _meta.yml in flow-style with the schema header preserved (deriver-parseable)", async () => {
  // Regression: workspaceState used the raw `yaml` stringify, which emits
  // block-nested `domains.*` and drops the leading `# yaml-language-server`
  // header. The restricted deriver parser rejects block nesting with
  // "nested values must be scalars in this subset" — exactly the CI failure
  // PR #228 hit on its first human submission. The editor MUST route through
  // the form-engine serializer (flowAtDepth: 2 + originalText).
  const gh = fakeGh({
    "components/src/button/_meta.yml": META_WITH_HEADER,
  });
  const cart = new SubmissionCart(makeStorage());
  await promoteDomainToDraft(gh, "button", "behavior", cart);
  const entry = cart
    .list()
    .find((e) => e.path === "components/src/button/_meta.yml");
  assert.ok(entry, "_meta.yml staged in cart");
  const out = entry!.content;
  // IDE schema-hinting header survives the rewrite.
  assert.match(out, /^# yaml-language-server: \$schema=/);
  // The promoted domain is emitted as an inline flow map.
  assert.match(out, /behavior: \{ status: draft \}/);
  // Untouched domains keep their flow-style shape.
  assert.match(out, /content: \{ status: approved, owner: content-team \}/);
  // No block-nested domain values (the corruption shape the deriver rejects).
  assert.doesNotMatch(out, /\n {4}status:/);
});

test("setDomainInherited rewrites _meta.yml in flow-style with the schema header preserved", async () => {
  const gh = fakeGh({
    "components/src/button/_meta.yml": META_WITH_HEADER,
  });
  const cart = new SubmissionCart(makeStorage());
  await setDomainInherited(gh, "button", "usage", true, cart);
  const out = cart
    .list()
    .find((e) => e.path === "components/src/button/_meta.yml")!.content;
  assert.match(out, /^# yaml-language-server: \$schema=/);
  assert.match(out, /usage: \{ status: inherited \}/);
  assert.doesNotMatch(out, /\n {4}status:/);
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

test("domainFileForPath: matches the four prose domain files", () => {
  assert.deepEqual(domainFileForPath("components/src/button/usage.md"), {
    slug: "button",
    domain: "usage",
  });
  assert.deepEqual(domainFileForPath("components/src/text-input/content.md"), {
    slug: "text-input",
    domain: "content",
  });
  assert.deepEqual(domainFileForPath("components/src/tag/design.md"), {
    slug: "tag",
    domain: "design",
  });
  assert.deepEqual(domainFileForPath("components/src/modal/behavior.md"), {
    slug: "modal",
    domain: "behavior",
  });
});

test("domainFileForPath: rejects non-domain and out-of-scope paths", () => {
  assert.equal(domainFileForPath("components/src/button/_meta.yml"), null);
  assert.equal(domainFileForPath("components/src/button/tokens.yml"), null);
  assert.equal(domainFileForPath("components/src/button/AUTHORING.md"), null);
  assert.equal(domainFileForPath("components/src/categories/action.md"), null);
  assert.equal(domainFileForPath("accessibility/src/buttons.md"), null);
  assert.equal(domainFileForPath("foundations/src/tokens.md"), null);
  assert.equal(
    domainFileForPath("components/src/button/nested/usage.md"),
    null,
  );
});

test("setDomainStatus: promotes a domain to approved, flow-style + header preserved", async () => {
  const gh = fakeGh({ "components/src/button/_meta.yml": META_WITH_HEADER });
  const cart = new SubmissionCart(makeStorage());
  await setDomainStatus(gh, "button", "usage", "approved", cart);
  const out = cart
    .list()
    .find((e) => e.path === "components/src/button/_meta.yml")!.content;
  assert.match(out, /^# yaml-language-server: \$schema=/);
  assert.match(out, /usage: \{ status: approved \}/);
  // Untouched domains keep their flow-style shape.
  assert.match(out, /content: \{ status: approved, owner: content-team \}/);
  // No block-nested domain values (the corruption shape the deriver rejects).
  assert.doesNotMatch(out, /\n {4}status:/);
  // The remote blob sha is preserved so detectStaleBase can catch a
  // concurrent remote change instead of silently overwriting it.
  const entry = cart
    .list()
    .find((e) => e.path === "components/src/button/_meta.yml")!;
  assert.equal(entry.basedOnSha, "sha-components/src/button/_meta.yml");
});

test("setDomainStatus: demotes approved back to draft", async () => {
  // content starts approved in META_WITH_HEADER; pull it back to draft.
  const gh = fakeGh({ "components/src/button/_meta.yml": META_WITH_HEADER });
  const cart = new SubmissionCart(makeStorage());
  await setDomainStatus(gh, "button", "content", "draft", cart);
  const out = cart
    .list()
    .find((e) => e.path === "components/src/button/_meta.yml")!.content;
  // owner is preserved alongside the changed status.
  assert.match(out, /content: \{ status: draft, owner: content-team \}/);
});

test("setDomainStatus: idempotent — no cart write when already at that status", async () => {
  // content is already approved in META_WITH_HEADER.
  const gh = fakeGh({ "components/src/button/_meta.yml": META_WITH_HEADER });
  const cart = new SubmissionCart(makeStorage());
  await setDomainStatus(gh, "button", "content", "approved", cart);
  assert.equal(
    cart.list().find((e) => e.path === "components/src/button/_meta.yml"),
    undefined,
    "no _meta.yml staged when the status is unchanged",
  );
});

test("readDeclaredStatus: reads from remote when nothing is staged", async () => {
  const gh = fakeGh({ "components/src/button/_meta.yml": META_WITH_HEADER });
  const cart = new SubmissionCart(makeStorage());
  assert.equal(
    await readDeclaredStatus(gh, "button", "content", cart),
    "approved",
  );
  assert.equal(
    await readDeclaredStatus(gh, "button", "usage", cart),
    "not-started",
  );
});

test("readDeclaredStatus: cart wins over remote", async () => {
  const gh = fakeGh({ "components/src/button/_meta.yml": META_WITH_HEADER });
  const cart = new SubmissionCart(makeStorage());
  await setDomainStatus(gh, "button", "usage", "approved", cart);
  assert.equal(
    await readDeclaredStatus(gh, "button", "usage", cart),
    "approved",
  );
});
