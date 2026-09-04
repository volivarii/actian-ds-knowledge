import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { loadMediaRoles, loadMediaCapture, AUTHOR_ROLES } from "../../src/lib/loadMediaIndex";

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
  assert.deepEqual(
    roles,
    [],
    "button has only preview+default → nothing to place",
  );
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
    repos: {
      getContent: async () => {
        throw new Error("boom");
      },
    },
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

test("loadMediaRoles: normalizes a single-string role value (multi=false)", async () => {
  globalThis.sessionStorage.clear();
  const INDEX_SINGLE = {
    media: {
      widget: {
        parts: "components/dist/media/widget/parts.webp",
        default: "components/dist/media/widget/default.webp",
      },
    },
  };
  const content = Buffer.from(JSON.stringify(INDEX_SINGLE)).toString("base64");
  const gh = {
    repos: {
      getContent: async () => ({ data: { content, encoding: "base64" } }),
    },
  } as any;
  const roles = await loadMediaRoles(gh, "widget");
  assert.equal(roles.length, 1);
  const entry = roles[0]!;
  assert.equal(entry.role, "parts");
  assert.equal(entry.multi, false);
  assert.deepEqual(entry.paths, ["components/dist/media/widget/parts.webp"]);
});

// The panel that consumes this puts the capture BESIDE the canonical render and
// tells the author the render is what needs fixing where they disagree. That
// only holds if the two show the same subject. `default` is the component's
// default variant captured in isolation -- the fidelity oracle, and the render's
// like-for-like counterpart. `preview` is the Figma doc page's Preview frame: a
// page of many variants at page scale. 198 slugs have `default` and 88 have
// `preview`, so preferring `preview` made the same column mean two different
// things depending on which component was open, with nothing saying which. Hence
// `default` first, and the role reported so the caller can name what it shows.
test("loadMediaCapture: the isolated default variant first, the doc preview second", async () => {
  globalThis.sessionStorage.clear();
  assert.deepEqual(await loadMediaCapture(fakeGh(INDEX), "alert-banner"), {
    path: "components/dist/media/alert-banner/default.webp",
    role: "default",
  });
});

test("loadMediaCapture: falls back to the preview frame when there is no default", async () => {
  globalThis.sessionStorage.clear();
  const previewOnly = {
    _schema_version: 1,
    media: { chip: { preview: "components/dist/media/chip/preview.webp" } },
  };
  assert.deepEqual(await loadMediaCapture(fakeGh(previewOnly), "chip"), {
    path: "components/dist/media/chip/preview.webp",
    role: "preview",
  });
});

test("loadMediaCapture: null when the slug has neither capture", async () => {
  globalThis.sessionStorage.clear();
  assert.equal(await loadMediaCapture(fakeGh(INDEX), "no-such"), null);
});

test("loadMediaCapture: an index that cannot be read rejects naming the index, it does not read as absence", async () => {
  globalThis.sessionStorage.clear();
  const gh = {
    repos: {
      getContent: async () => {
        const err = new Error("rate limited") as Error & { status: number };
        err.status = 403;
        throw err;
      },
    },
  } as any;
  await assert.rejects(
    () => loadMediaCapture(gh, "button"),
    (err: Error) => /_index\.json/.test(err.message),
  );
});

test("loadMediaCapture: an index with no entries rejects for every reader, and caches nothing", async () => {
  // The empty-index rule used to live in loadCapturedSlugs alone, AFTER
  // loadIndex had cached the empty map: the render panel and the media picker
  // reported "no media" for every component for the TTL while the coverage
  // dashboard cleared the cache, and the next panel open re-poisoned it.
  globalThis.sessionStorage.clear();
  const gh = fakeGh({ _schema_version: 1, entries: INDEX.media });
  await assert.rejects(
    () => loadMediaCapture(gh, "button"),
    (err: Error) => /no media entries/.test(err.message),
  );
  assert.equal(globalThis.sessionStorage.length, 0, "the empty index was cached");
  // The picker is lenient by design: nothing offered, no throw.
  assert.deepEqual(await loadMediaRoles(gh, "alert-banner"), []);
  // Positive control for the cache assertion: a real index IS cached, so the
  // zero above is about the empty index and not about caching being absent.
  const good = await loadMediaCapture(fakeGh(INDEX), "button");
  assert.ok(good);
  assert.equal(globalThis.sessionStorage.length, 1);
});
