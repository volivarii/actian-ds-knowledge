import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { loadMediaRoles, AUTHOR_ROLES } from "../../src/lib/loadMediaIndex";

const INDEX = {
  _schema_version: 1,
  media: {
    "alert-banner": {
      preview: "components/dist/media/alert-banner/preview.webp",
      variations: ["components/dist/media/alert-banner/variations-0.webp"],
      layout: [
        "components/dist/media/alert-banner/layout-0.webp",
        "components/dist/media/alert-banner/layout-1.webp",
      ],
      default: "components/dist/media/alert-banner/default.webp",
    },
    button: {
      preview: "components/dist/media/button/preview.webp",
      default: "components/dist/media/button/default.webp",
    },
  },
};

function fakeGh(json: unknown, counter?: { n: number }) {
  const content = Buffer.from(JSON.stringify(json)).toString("base64");
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (counter) counter.n += 1;
        if (path === "components/dist/media/_index.json") {
          return { data: { content, encoding: "base64" } };
        }
        const err = new Error("not found") as Error & { status: number };
        err.status = 404;
        throw err;
      },
    },
  } as any;
}

test("loadMediaRoles: returns author-placeable roles present for the slug", async () => {
  globalThis.sessionStorage.clear();
  const roles = await loadMediaRoles(fakeGh(INDEX), "alert-banner");
  assert.deepEqual(
    roles.map((r) => r.role),
    ["variations", "layout"],
    "only author roles, in AUTHOR_ROLES order",
  );
});

test("loadMediaRoles: never offers preview or default", async () => {
  globalThis.sessionStorage.clear();
  const roles = await loadMediaRoles(fakeGh(INDEX), "button");
  assert.deepEqual(roles, [], "button has only preview+default → nothing to place");
});

test("loadMediaRoles: normalizes single vs multi captures", async () => {
  globalThis.sessionStorage.clear();
  const roles = await loadMediaRoles(fakeGh(INDEX), "alert-banner");
  const variations = roles.find((r) => r.role === "variations")!;
  const layout = roles.find((r) => r.role === "layout")!;
  assert.equal(variations.multi, true);
  assert.equal(variations.paths.length, 1);
  assert.equal(layout.multi, true);
  assert.equal(layout.paths.length, 2);
});

test("loadMediaRoles: unknown slug returns []", async () => {
  globalThis.sessionStorage.clear();
  const roles = await loadMediaRoles(fakeGh(INDEX), "no-such-component");
  assert.deepEqual(roles, []);
});

test("loadMediaRoles: fetch failure returns []", async () => {
  globalThis.sessionStorage.clear();
  const gh = {
    repos: { getContent: async () => { throw new Error("boom"); } },
  } as any;
  assert.deepEqual(await loadMediaRoles(gh, "alert-banner"), []);
});

test("loadMediaRoles: caches the index across calls + slugs", async () => {
  globalThis.sessionStorage.clear();
  const counter = { n: 0 };
  const gh = fakeGh(INDEX, counter);
  await loadMediaRoles(gh, "alert-banner");
  await loadMediaRoles(gh, "button");
  assert.equal(counter.n, 1, "index fetched once, sliced per slug");
});

test("AUTHOR_ROLES excludes preview and default", () => {
  assert.equal(AUTHOR_ROLES.includes("preview" as never), false);
  assert.equal(AUTHOR_ROLES.includes("default" as never), false);
});
