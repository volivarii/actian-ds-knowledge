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

test("two edits fired together both land: each reads the batch after the previous one wrote", async () => {
  const cart = new SubmissionCart(makeStorage());
  const slow = {
    repos: {
      getContent: async (a: { path: string }) => {
        await new Promise((r) => setTimeout(r, 5));
        return gh.repos.getContent(a);
      },
    },
  } as any;
  const add = (slug: string) => (p: Record<string, unknown>) =>
    applyConnectionEdit(p, { op: "add", field: ["a11y_refs"], slug, shape: "ref" });
  await Promise.all([
    updateMetaInCart(slow, "button", add("tooltips"), cart),
    updateMetaInCart(slow, "button", add("focus-keyboard"), cart),
  ]);
  const e = cart.list().find((x) => x.path === META_PATH)!;
  assert.match(e.content, /ref: tooltips/);
  assert.match(e.content, /ref: focus-keyboard/, "the second edit overwrote the first");
});

test("the mutation receives main's file, so a removed ref comes back with its note", async () => {
  const noted =
    'component: "Drawer"\na11y_refs:\n  - ref: dialogs\n    note: Traps focus while open.\n  - { ref: buttons }\ndomains:\n  usage: { status: approved }\n';
  const ghNoted = {
    repos: {
      getContent: async () => ({
        data: { content: Buffer.from(noted).toString("base64"), encoding: "base64", sha: "s2" },
      }),
    },
  } as any;
  const cart = new SubmissionCart(makeStorage());
  const edit = (op: "add" | "remove") => (p: Record<string, unknown>, original?: Record<string, unknown>) =>
    applyConnectionEdit(p, { op, field: ["a11y_refs"], slug: "dialogs", shape: "ref" }, original);
  await updateMetaInCart(ghNoted, "drawer", edit("remove"), cart);
  assert.equal(cart.list().length, 1);
  await updateMetaInCart(ghNoted, "drawer", edit("add"), cart);
  assert.equal(cart.list().length, 0, "undoing the removal leaves nothing in the batch");
});

test("a failed read rejects, so the caller can say the edit did not save", async () => {
  const cart = new SubmissionCart(makeStorage());
  const broken = {
    repos: {
      getContent: async () => {
        const e = new Error("boom") as Error & { status: number };
        e.status = 500;
        throw e;
      },
    },
  } as any;
  await assert.rejects(updateMetaInCart(broken, "button", addTooltips, cart));
  // The queue survives a failure: the next edit still runs.
  await updateMetaInCart(gh, "button", addTooltips, cart);
  assert.ok(cart.has(META_PATH));
});
