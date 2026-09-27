import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { linkedSlugs, codeMentions, linkMention } from "../../src/lib/connections/bodyLinks";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("bare-slug links only, unique, in order", () => {
  const md =
    "Use a [table](table), a [tip](tooltip), [ext](https://x.y), [anchor](#top), [path](../a/b.md), again [table](table).";
  assert.deepEqual(linkedSlugs(md), ["table", "tooltip"]);
});

test("links inside fenced code are ignored", () => {
  assert.deepEqual(linkedSlugs("```\n[a](modal)\n```\n[b](drawer)"), ["drawer"]);
});

test("Button's real guidance links ten slugs", () => {
  const text = ["usage.md", "content.md"]
    .map((f) => readFileSync(join(REPO, "components/src/button", f), "utf8"))
    .join("\n");
  assert.deepEqual(
    new Set(linkedSlugs(text)),
    new Set([
      "confirmation",
      "dropdown-select",
      "link",
      "modal",
      "page-header",
      "segmented-control",
      "table",
      "tabs",
      "toggle",
      "tooltip",
    ]),
  );
});

test("code-style mentions of known slugs", () => {
  const md = "Distinct from `faceted-browse`, and `search-filtered-table`, not `x-y`.";
  assert.deepEqual(codeMentions(md, new Set(["faceted-browse", "search-filtered-table"])), [
    "faceted-browse",
    "search-filtered-table",
  ]);
});

test("linkMention rewrites the first span to a standard link", () => {
  const md = "From `faceted-browse` and `faceted-browse`.";
  assert.equal(
    linkMention(md, "faceted-browse", "faceted browse"),
    "From [faceted browse](faceted-browse) and `faceted-browse`.",
  );
  assert.equal(linkMention("nothing here", "faceted-browse", "x"), "nothing here");
});
