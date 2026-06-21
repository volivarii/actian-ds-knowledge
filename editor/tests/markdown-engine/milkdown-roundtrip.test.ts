import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { getMarkdown } from "@milkdown/utils";

const require = createRequire(import.meta.url);
// splitFrontmatter returns { data, body } — data is already YAML-parsed
const { splitFrontmatter, parseBodySections } = require("../../../scripts/app-context/lib-pure");
const { assembleAppRecord } = require("../../../scripts/app-context/derive-app-context");

async function milkdownRoundTrip(body: string): Promise<string> {
  const root = globalThis.document.createElement("div");
  const editor = await Editor.make()
    .config((ctx) => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, body); })
    .use(commonmark)
    .create();
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

const APPS_DIR = new URL("../../../app-context/src/apps/", import.meta.url).pathname;

test("every app-context app body derives identically after a Milkdown round-trip", async () => {
  const files = readdirSync(APPS_DIR).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 1, "expected at least one app fixture");
  for (const f of files) {
    const raw = readFileSync(APPS_DIR + f, "utf8");
    // splitFrontmatter returns { data (already parsed), body }
    const { data: fm, body } = splitFrontmatter(raw);
    const original = assembleAppRecord(fm, parseBodySections(body));
    const roundtripped = assembleAppRecord(fm, parseBodySections(await milkdownRoundTrip(body)));
    assert.deepEqual(roundtripped, original, `dist drift for ${f}`);
  }
});
