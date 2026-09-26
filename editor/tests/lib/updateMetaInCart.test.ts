import { test } from "node:test";
import assert from "node:assert/strict";
import { updateMetaInCart } from "../../src/lib/workspaceState";
import { SubmissionCart } from "../../src/drafts/SubmissionCart";
import { applyConnectionEdit } from "../../src/lib/connections/owned";

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

const META_PATH = "components/src/button/_meta.yml";
const META =
  '# yaml-language-server: $schema=../../../schemas/guideline-meta.json\ncomponent: "Button"\ncategory: action\na11y_refs:\n  - { ref: buttons }\ndomains:\n  usage: { status: approved }\n';
const gh = {
  repos: {
    getContent: async ({ path }: { path: string }) => {
      if (path !== META_PATH) {
        const e = new Error("nf") as Error & { status: number };
        e.status = 404;
        throw e;
      }
      return { data: { content: Buffer.from(META).toString("base64"), encoding: "base64", sha: "s1" } };
    },
  },
} as any;
const addTooltips = (p: Record<string, unknown>) =>
  applyConnectionEdit(p, { op: "add", field: ["a11y_refs"], slug: "tooltips", shape: "ref" });
const removeTooltips = (p: Record<string, unknown>) =>
  applyConnectionEdit(p, { op: "remove", field: ["a11y_refs"], slug: "tooltips", shape: "ref" });

test("an edit stages _meta.yml with the ref added, keeping the header and flow style", async () => {
  const cart = new SubmissionCart(makeStorage());
  await updateMetaInCart(gh, "button", addTooltips, cart);
  const e = cart.list().find((x) => x.path === META_PATH)!;
  assert.equal(e.basedOnSha, "s1");
  assert.match(e.content, /- \{ ref: buttons \}\n\s+- \{ ref: tooltips \}\n/);
  assert.match(e.content, /^# yaml-language-server/, "the schema header is kept");
  assert.match(e.content, /usage: \{ status: approved \}/, "flow-style domains are kept");
});

test("an edit undone leaves nothing in the batch", async () => {
  const cart = new SubmissionCart(makeStorage());
  await updateMetaInCart(gh, "button", addTooltips, cart);
  await updateMetaInCart(gh, "button", removeTooltips, cart);
  assert.equal(cart.has(META_PATH), false);
});
