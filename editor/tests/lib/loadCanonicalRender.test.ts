import { test } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { loadCanonicalRender } from "../../src/lib/loadCanonicalRender";

const DIST = "components/render/dist";
const PAGE = "body{margin:0;padding:24px;background:#fff}";

function manifest(slugs: string[], over: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: "1.2.0",
    generatedBy: "scripts/render/derive-canonical.js",
    css: "render.css",
    fontsCss: "render-fonts.css",
    pageCss: PAGE,
    renders: slugs.map((slug) => ({
      slug,
      tagName: `zen-${slug}`,
      group: "Action",
      fragment: `fragments/${slug}.html`,
      tokensConsumed: 1,
      source: "rendered",
    })),
    ...over,
  });
}

const FRAGMENT =
  '<div id="fidelity-root" data-slug="button"><button class="ds-button ds-button--primary">Primary</button></div>';
const CSS = ".ds-button{color:red}";
const FONTS = "@font-face{font-family:ActianTest;src:url(data:font/woff2;base64,AAAA)}";
const NO_RENAMES = JSON.stringify({ schemaVersion: "1.0.0", entries: {} });

function files(over: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    [`${DIST}/render-manifest.json`]: manifest(["button", "badge"]),
    [`${DIST}/render.css`]: CSS,
    [`${DIST}/render-fonts.css`]: FONTS,
    [`${DIST}/fragments/button.html`]: FRAGMENT,
    [`${DIST}/fragments/badge.html`]:
      '<div id="fidelity-root" data-slug="badge"><span class="ds-badge">New</span></div>',
    "paths-manifest.json": JSON.stringify({ knowledge_version: "0.34.169" }),
    "components/dist/identity.json": NO_RENAMES,
  };
  return { ...base, ...over };
}

function fakeGh(map: Record<string, string | undefined>, hits: Record<string, number> = {}) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        hits[path] = (hits[path] ?? 0) + 1;
        const content = map[path];
        if (content === undefined) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return {
          data: {
            content: Buffer.from(content).toString("base64"),
            encoding: "base64",
            sha: `sha-${path}`,
          },
        };
      },
      listCommits: async () => ({ data: [] }),
    },
  } as any;
}

test("a rendered slug becomes one document in the bundle's order: fonts, stylesheet, page framing, fragment", async () => {
  const r = await loadCanonicalRender(fakeGh(files()), "button");
  assert.equal(r.kind, "rendered");
  if (r.kind !== "rendered") return;
  assert.ok(r.html.startsWith("<!doctype html>"), "a complete document, not a fragment");
  assert.ok(r.html.includes('<meta charset="utf-8">'));
  const at = (s: string) => r.html.indexOf(s);
  assert.ok(at(FONTS) >= 0 && at(CSS) >= 0 && at(PAGE) >= 0 && at(FRAGMENT) >= 0, "all four parts present");
  assert.ok(
    at(FONTS) < at(CSS) && at(CSS) < at(PAGE) && at(PAGE) < at(FRAGMENT),
    "fonts, stylesheet, page framing LAST in the cascade (as selfContainedCard), then the fragment",
  );
  assert.equal(r.version, "0.34.169");
});

test("the page framing comes from the manifest, never from a copy in the editor", async () => {
  const gh = fakeGh(files({ [`${DIST}/render-manifest.json`]: manifest(["button"], { pageCss: undefined }) }));
  const r = await loadCanonicalRender(gh, "button");
  assert.equal(r.kind, "rendered");
  if (r.kind !== "rendered") return;
  assert.ok(!r.html.includes("body{"), "an older dist without pageCss gets no framing invented for it");
});

test("a slug with no render fragment says so and says how many components have one", async () => {
  const r = await loadCanonicalRender(fakeGh(files()), "no-such-component");
  assert.deepEqual(r, { kind: "absent", rendered: 2 });
});

test("a renamed component resolves through the identity ledger to its current render", async () => {
  const gh = fakeGh(
    files({
      [`${DIST}/render-manifest.json`]: manifest(["tooltip-default"]),
      [`${DIST}/fragments/tooltip-default.html`]:
        '<div id="fidelity-root" data-slug="tooltip-default"><span class="ds-tooltip">Tip</span></div>',
      "components/dist/identity.json": JSON.stringify({
        schemaVersion: "1.0.0",
        entries: { abc: { slug: "tooltip-default", previousSlugs: ["tooltip"], kind: null } },
      }),
    }),
  );
  const r = await loadCanonicalRender(gh, "tooltip");
  assert.equal(r.kind, "rendered", "the authored slug still finds its render after the rename");
  if (r.kind !== "rendered") return;
  assert.ok(r.html.includes('data-slug="tooltip-default"'));
});

test("the manifest, the ledger, the stylesheet and the fonts are read once per client, not once per component", async () => {
  const hits: Record<string, number> = {};
  const gh = fakeGh(files(), hits);
  await loadCanonicalRender(gh, "button");
  await loadCanonicalRender(gh, "badge");
  assert.equal(hits[`${DIST}/render-manifest.json`], 1);
  assert.equal(hits["components/dist/identity.json"], 1);
  assert.equal(hits[`${DIST}/render.css`], 1);
  assert.equal(hits[`${DIST}/render-fonts.css`], 1);
  assert.equal(hits[`${DIST}/fragments/button.html`], 1);
  assert.equal(hits[`${DIST}/fragments/badge.html`], 1);
});

test("two clients do not share a cache: a second client sees its own dist", async () => {
  const a = await loadCanonicalRender(fakeGh(files()), "button");
  const b = await loadCanonicalRender(
    fakeGh(files({ [`${DIST}/render.css`]: ".ds-button{color:blue}" })),
    "button",
  );
  assert.equal(a.kind, "rendered");
  assert.equal(b.kind, "rendered");
  if (a.kind !== "rendered" || b.kind !== "rendered") return;
  assert.ok(a.html.includes("color:red"));
  assert.ok(b.html.includes("color:blue"), "the second client's stylesheet, not the first's");
});

test("an unreadable version is a missing caption, never a missing render", async () => {
  const gh = fakeGh(files({ "paths-manifest.json": undefined }));
  const r = await loadCanonicalRender(gh, "button");
  assert.equal(r.kind, "rendered");
  if (r.kind !== "rendered") return;
  assert.equal(r.version, null);
});

test("a stylesheet that cannot be read is an error, never an unstyled render", async () => {
  const gh = fakeGh(files({ [`${DIST}/render.css`]: undefined }));
  await assert.rejects(
    () => loadCanonicalRender(gh, "button"),
    (err: Error) => /render\.css/.test(err.message),
  );
});

test("a manifest that lists a slug whose fragment is missing is an error naming the fragment", async () => {
  const gh = fakeGh(files({ [`${DIST}/fragments/button.html`]: undefined }));
  await assert.rejects(
    () => loadCanonicalRender(gh, "button"),
    (err: Error) => /fragments\/button\.html/.test(err.message),
  );
});

test("a manifest that is not JSON is an error naming the manifest, not a bare parse error", async () => {
  const gh = fakeGh(files({ [`${DIST}/render-manifest.json`]: "<html>rate limited</html>" }));
  await assert.rejects(
    () => loadCanonicalRender(gh, "button"),
    (err: Error) => /render-manifest\.json/.test(err.message),
  );
});

test("the frame measures its body, whose height can shrink, not the root, whose scrollHeight never drops below the viewport", async () => {
  const r = await loadCanonicalRender(fakeGh(files()), "button");
  assert.equal(r.kind, "rendered");
  if (r.kind !== "rendered") return;
  assert.ok(r.html.includes("document.body.getBoundingClientRect()"), "measures the body box");
  assert.ok(!r.html.includes("documentElement.scrollHeight"), "root scrollHeight ratchets up and never down");
});
