import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { assembleFrontmatterFile } from "../../src/app/FrontmatterBodyEditScreen";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";
import { roundTripMarkdown } from "../../src/markdown-engine/milkdownPreset";

// The derive's restricted YAML parser — the SoT for what consumers get. The
// editor uses the standard `yaml` lib, which parses category frontmatter
// differently (it splits unquoted commas in flow maps into phantom keys). The
// guard below proves the editor save path agrees with the derive parser, so an
// edit can't silently change the derived dist.
const require = createRequire(import.meta.url);
const categoriesParser = require("../../../scripts/categories/categories-parser");

const CAT_DIR = new URL("../../../components/src/categories/", import.meta.url)
  .pathname;
function categoryFiles(): string[] {
  // Mirror the production predicate (lib/wysiwygPaths.isCategoryFile): exclude
  // AUTHORING.md exactly, not any filename containing "AUTHORING".
  return readdirSync(CAT_DIR).filter(
    (f) => f.endsWith(".md") && !/AUTHORING\.md$/.test(f),
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
    await roundTripMarkdown(body),
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
    assert.equal(
      await editSaveCycle(text),
      text,
      `category not canonical: ${f}`,
    );
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

test("category bodies contain no inline HTML (rollout gate, body-scoped)", () => {
  // Body-scoped by design: HTML inside a YAML frontmatter scalar is just a
  // string (no Milkdown round-trip), so only the body is a round-trip risk.
  for (const f of categoryFiles()) {
    const { body } = splitFrontmatter(readFileSync(CAT_DIR + f, "utf8"));
    assert.ok(
      !/<[a-zA-Z][a-zA-Z0-9]*[ >/]/.test(body),
      `inline HTML in ${f} is not round-trip safe — keep WYSIWYG off until handled`,
    );
  }
});

test("category sources contain no backslash (rollout gate — escape desync)", () => {
  // Fail-closed gate. The derive's restricted parser does NOT process escape
  // sequences (categories-parser.js), but the editor's yaml lib double-quotes +
  // escapes a value that needs quoting (e.g. one containing a comma or ": ").
  // So a scalar with BOTH a quote-forcing char AND a backslash would desync:
  // the saved source carries "\\" while the derived dist would read it as a
  // literal "\\" (extra backslash) — not what the author typed. No category
  // content has backslashes today; reject them until the save/derive path is
  // escape-aware (mirrors the inline-HTML gate above).
  for (const f of categoryFiles()) {
    const text = readFileSync(CAT_DIR + f, "utf8");
    assert.ok(
      !text.includes("\\"),
      `backslash in ${f} is not round-trip safe — the derive parser doesn't process escapes; handle escapes before keeping it`,
    );
  }
});

test("category constructs survive the round-trip (idempotent + content preserved)", async () => {
  // NOTE: the FIRST pass may normalize — Milkdown escapes a bare `_` in prose
  // (`data_product` → `data\_product`), so we deliberately do NOT assert
  // first-pass identity here. The real protections against that class are the
  // fixed-point test over actual sources (canonical = first-pass-stable) and the
  // fail-closed backslash gate. This test asserts the editor reaches a fixed
  // point by the SECOND pass and preserves inline-code / bold content.
  const body =
    "# Action — design rationale\n\nMembers: `button`, `link` and data_product flows.\n\n## Reference patterns\n\n* **Polaris** — Button, Link\n* **Material** — Buttons\n";
  const once = await roundTripMarkdown(body);
  const twice = await roundTripMarkdown(once);
  assert.equal(twice, once, "round-trip must reach a fixed point (idempotent)");
  assert.match(once, /`button`/, "inline code preserved");
  assert.match(once, /\*\*Polaris\*\*/, "bold preserved");
});
