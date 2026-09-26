import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionAnchors, searchReferenceTargets } from "../../src/lib/referenceIndex";

test("searchReferenceTargets: matches component nodes by title, prefix ranks before substring", () => {
  const out = searchReferenceTargets("but", "");
  assert.ok(out.length > 0);
  assert.equal(out[0]!.kind, "component");
  assert.ok(out[0]!.label.toLowerCase().startsWith("but")); // Button
  assert.ok(
    out.every((t) => t.kind !== "component" || !t.href.startsWith("#")),
  );
});

test("searchReferenceTargets: current file's section anchors rank first on exact prefix and use #slug hrefs", () => {
  const text = "## Usage rules {#usage-rules}\n\nBody.\n";
  const out = searchReferenceTargets("usage", text);
  const section = out.find((t) => t.kind === "section");
  assert.ok(section);
  assert.equal(section!.href, "#usage-rules");
});

test("searchReferenceTargets: empty query returns [] and limit caps results", () => {
  assert.deepEqual(searchReferenceTargets("", ""), []);
  assert.ok(searchReferenceTargets("a", "", 3).length <= 3);
});

test("searchReferenceTargets: a section prefix match and a component substring match compete on the same query; the closer (prefix) match wins", () => {
  // "table" prefix-matches the current file's "Table settings" heading
  // (score 0) while ALSO substring-matching real component nodes in the
  // baked graph (e.g. "device-tablet", score 3): real competition between
  // both kinds on one query, not a single-result set.
  const text = "## Table settings {#table-settings}\n\nBody.\n";
  const out = searchReferenceTargets("table", text);
  assert.ok(
    out.some((t) => t.kind === "component"),
    'expected at least one component to also match "table", got: ' +
      JSON.stringify(out),
  );
  assert.ok(
    out.length > 1,
    "expected real competition, not a single-result set",
  );
  assert.equal(out[0]!.kind, "section");
});

// ── An anchor that is "" is not an anchor ───────────────────────────────────
//
// `extractAnchor` -> `deriveSlug` yields "" for an H2 whose title has nothing
// sluggable left: "## 🎯", "## ---", "## ***". Not "## 3.", which gives "3".
// The type says `string | null`, so callers guard on `=== null` and would let
// "" through as an anchor that is falsy in use.
//
// Zero occurrences in today's corpus, but this is an authoring tool and the
// headings are typed in it.
test("sectionAnchors: a heading with no derivable slug reports null, not an empty string", () => {
  const text = "## 🎯\n\nBody.\n\n## Real Heading\n\nMore.\n";
  const anchors = sectionAnchors(text);
  assert.equal(
    anchors[0]!.anchor,
    null,
    `an empty derived slug must be null, got ${JSON.stringify(anchors[0]!.anchor)}`,
  );
  assert.equal(anchors[1]!.anchor, "real-heading");
});
