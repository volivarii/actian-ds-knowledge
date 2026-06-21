import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { getMarkdown } from "@milkdown/utils";
import { assembleFrontmatterFile } from "../../src/app/FrontmatterBodyEditScreen";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";

// The derive's restricted YAML parser — the SoT for what consumers get. The
// editor uses the standard `yaml` lib, which parses category frontmatter
// differently (it splits unquoted commas in flow maps into phantom keys). The
// guard below proves the editor save path agrees with the derive parser, so an
// edit can't silently change the derived dist.
const require = createRequire(import.meta.url);
const categoriesParser = require("../../../scripts/categories/categories-parser");

async function milkdownRoundTrip(body: string): Promise<string> {
  const root = globalThis.document.createElement("div");
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, body);
    })
    .use(commonmark)
    .create();
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

const CAT_DIR = new URL(
  "../../../components/src/categories/",
  import.meta.url,
).pathname;
function categoryFiles(): string[] {
  return readdirSync(CAT_DIR).filter(
    (f) => f.endsWith(".md") && !/AUTHORING/.test(f),
  );
}

// Model the REAL editor save: split frontmatter (standard yaml lib), round-trip
// the body through Milkdown, reassemble via assembleFrontmatterFile (which
// re-serializes the frontmatter and injects the leading blank line). A canonical
// source file is a fixed point of this cycle — so a no-op WYSIWYG edit produces
// byte-identical output (no churn) and the verbatim dist copy stays stable.
async function editSaveCycle(text: string): Promise<string> {
  const { data, body, frontmatterText } = splitFrontmatter(text);
  return assembleFrontmatterFile(
    data,
    frontmatterText,
    await milkdownRoundTrip(body),
  );
}

// What the derive parser extracts from a file's frontmatter — the consumer-
// facing structure. Equivalence of this before/after an editor save is the real
// guarantee (byte-identity alone is necessary but not sufficient: a fixed point
// can still be derive-invalid).
function deriveView(text: string): unknown {
  const fm = splitFrontmatter(text).frontmatterText ?? "";
  return categoriesParser.parseFrontmatter(fm, 0);
}

test("every category source is a fixed point under the editor save cycle (no churn)", async () => {
  const files = categoryFiles();
  assert.ok(files.length >= 1, "expected at least one category fixture");
  for (const f of files) {
    const text = readFileSync(CAT_DIR + f, "utf8");
    assert.equal(await editSaveCycle(text), text, `category not canonical: ${f}`);
  }
});

test("the editor save cycle preserves the derive-parser view (no silent dist drift)", async () => {
  for (const f of categoryFiles()) {
    const text = readFileSync(CAT_DIR + f, "utf8");
    const before = deriveView(text);
    const after = deriveView(await editSaveCycle(text));
    assert.deepEqual(
      after,
      before,
      `editor save changes what the derive parser reads for ${f} — the dist would drift`,
    );
  }
});

test("category bodies contain no inline HTML (rollout gate)", () => {
  for (const f of categoryFiles()) {
    const { body } = splitFrontmatter(readFileSync(CAT_DIR + f, "utf8"));
    assert.ok(
      !/<[a-zA-Z][a-zA-Z0-9]*[ >/]/.test(body),
      `inline HTML in ${f} is not round-trip safe — keep WYSIWYG off until handled`,
    );
  }
});

test("category constructs survive the round-trip (idempotent + content preserved)", async () => {
  const body =
    "# Action — design rationale\n\nMembers: `button`, `link` and data_product flows.\n\n## Reference patterns\n\n* **Polaris** — Button, Link\n* **Material** — Buttons\n";
  const once = await milkdownRoundTrip(body);
  const twice = await milkdownRoundTrip(once);
  assert.equal(twice, once, "round-trip must reach a fixed point (idempotent)");
  assert.match(once, /`button`/, "inline code preserved");
  assert.match(once, /\*\*Polaris\*\*/, "bold preserved");
});
