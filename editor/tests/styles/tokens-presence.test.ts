import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const baseCss = readFileSync(
  resolve(__dirname, "../../src/styles/base.css"),
  "utf-8",
);

// The hand-written REQUIRED_TOKENS list that used to sit here is gone. It named
// ten tokens base.css "depends on" and asserted each by substring, and one of
// them was `--zen-color-text-link-default`, a RETIRED name: the list obliged
// base.css to keep mentioning a token the design system had stopped publishing,
// and went red when it finally stopped (#580).
//
// `tests/app/zenNamespace.test.ts` replaces it with the derived pair: no
// stylesheet declares a --zen-* name the design system does not publish, and
// every --zen-* one reads resolves to something. Those cover every reference
// rather than ten chosen ones, and neither can require a name into existence.


test("base.css defines the .md-prose selector", () => {
  assert.match(baseCss, /\.md-prose\b/);
});

test("base.css defines the .cm-anchor-marker selector", () => {
  assert.match(baseCss, /\.cm-anchor-marker\b/);
});
