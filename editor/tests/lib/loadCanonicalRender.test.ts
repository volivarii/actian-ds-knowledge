import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import {
  loadCanonicalRender,
  resetCanonicalRenderCache,
} from "../../src/lib/loadCanonicalRender";

const DIST = "components/render/dist";

function manifest(slugs: string[]) {
  return JSON.stringify({
    schemaVersion: "1.1.0",
    generatedBy: "scripts/render/derive-canonical.js",
    css: "render.css",
    fontsCss: "render-fonts.css",
    renders: slugs.map((slug) => ({
      slug,
      tagName: `zen-${slug}`,
      group: "Action",
      fragment: `fragments/${slug}.html`,
      tokensConsumed: 1,
      source: "rendered",
    })),
  });
}

const FRAGMENT =
  '<div id="fidelity-root" data-slug="button"><button class="ds-button ds-button--primary">Primary</button></div>';
const CSS = ".ds-button{color:red}";
const FONTS = "@font-face{font-family:ActianTest;src:url(data:font/woff2;base64,AAAA)}";

function files(over: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    [`${DIST}/render-manifest.json`]: manifest(["button", "badge"]),
    [`${DIST}/render.css`]: CSS,
    [`${DIST}/render-fonts.css`]: FONTS,
    [`${DIST}/fragments/button.html`]: FRAGMENT,
    [`${DIST}/fragments/badge.html`]:
      '<div id="fidelity-root" data-slug="badge"><span class="ds-badge">New</span></div>',
    "package.json": JSON.stringify({ version: "0.34.169" }),
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
    },
  } as any;
}

beforeEach(() => resetCanonicalRenderCache());

test("a rendered slug becomes one document: fonts, then the stylesheet, then the fragment", async () => {
  const r = await loadCanonicalRender(fakeGh(files()), "button");
  assert.equal(r.kind, "rendered");
  if (r.kind !== "rendered") return;
  assert.ok(r.html.startsWith("<!doctype html>"), "a complete document, not a fragment");
  assert.ok(r.html.includes('<meta charset="utf-8">'));
  const iFonts = r.html.indexOf(FONTS);
  const iCss = r.html.indexOf(CSS);
  const iFrag = r.html.indexOf(FRAGMENT);
  assert.ok(iFonts >= 0 && iCss >= 0 && iFrag >= 0, "all three parts present");
  assert.ok(iFonts < iCss && iCss < iFrag, "fonts, stylesheet, fragment, in that order");
  assert.equal(r.group, "Action");
  assert.equal(r.version, "0.34.169");
});

test("a slug with no render fragment says so and says how many components have one", async () => {
  const r = await loadCanonicalRender(fakeGh(files()), "no-such-component");
  assert.deepEqual(r, { kind: "absent", rendered: 2 });
});

test("the manifest, the stylesheet and the fonts are read once per session, not once per component", async () => {
  const hits: Record<string, number> = {};
  const gh = fakeGh(files(), hits);
  await loadCanonicalRender(gh, "button");
  await loadCanonicalRender(gh, "badge");
  assert.equal(hits[`${DIST}/render-manifest.json`], 1);
  assert.equal(hits[`${DIST}/render.css`], 1);
  assert.equal(hits[`${DIST}/render-fonts.css`], 1);
  assert.equal(hits[`${DIST}/fragments/button.html`], 1);
  assert.equal(hits[`${DIST}/fragments/badge.html`], 1);
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
