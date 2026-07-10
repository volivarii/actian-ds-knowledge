import { test } from "node:test";
import assert from "node:assert/strict";
import { setCachedIndexForTesting } from "../../src/lib/anchorIndex";
import {
  incomingForFile,
  countsBySection,
  searchReferenceTargets,
} from "../../src/lib/referenceIndex";

const THIS_PATH = "foundations/src/tokens.md";
const THIS_TEXT = "## Tokens {#token-basics}\n\nBody.\n";
const REFERRER = "content/src/writing/voice-and-tone.md";
const REFERRER_TEXT =
  "Some intro.\n\nAlways cite [token basics](../foundations/tokens#token-basics) in copy.\n";

function seedIndex() {
  setCachedIndexForTesting({
    entries: new Map([
      [
        "token-basics",
        {
          slug: "token-basics",
          definedIn: [THIS_PATH],
          referencedBy: [REFERRER, THIS_PATH],
        },
      ],
    ]),
    scannedAt: 0,
    scannedPaths: [THIS_PATH, REFERRER],
    texts: new Map([
      [THIS_PATH, THIS_TEXT],
      [REFERRER, REFERRER_TEXT],
    ]),
  });
}

test("incomingForFile: referencing files yield contextual snippets; self-references excluded", () => {
  seedIndex();
  const incoming = incomingForFile(THIS_PATH, THIS_TEXT);
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0]!.fromPath, REFERRER);
  assert.equal(incoming[0]!.slug, "token-basics");
  assert.ok(incoming[0]!.snippet.includes("Always cite"));
  setCachedIndexForTesting(null);
});

test("incomingForFile: snippets come from the referencer's body, never its frontmatter YAML", () => {
  setCachedIndexForTesting({
    entries: new Map([
      [
        "token-basics",
        {
          slug: "token-basics",
          definedIn: ["foundations/src/tokens.md"],
          referencedBy: ["components/src/categories/action.md"],
        },
      ],
    ]),
    scannedAt: 0,
    scannedPaths: [],
    texts: new Map([
      [
        "components/src/categories/action.md",
        "---\na11y_refs:\n  requirementRefs:\n    - { ref: token-basics }\n---\n\nProse mentioning [token basics](../foundations/tokens#token-basics) here.\n",
      ],
    ]),
  });
  const incoming = incomingForFile(
    "foundations/src/tokens.md",
    "## Tokens {#token-basics}\n\nBody.\n",
  );
  const snippets = incoming.map((r) => r.snippet).filter((x) => x.length > 0);
  assert.equal(snippets.length, 1);
  assert.ok(snippets[0]!.includes("Prose mentioning"));
  assert.ok(!snippets.some((x) => x.includes("a11y_refs")));
  setCachedIndexForTesting(null);
});

test("incomingForFile: empty when index not loaded", () => {
  setCachedIndexForTesting(null);
  assert.deepEqual(incomingForFile(THIS_PATH, THIS_TEXT), []);
});

test("countsBySection: incoming count lands on the defining section anchor", () => {
  seedIndex();
  const counts = countsBySection(THIS_PATH, THIS_TEXT, 0);
  assert.equal(counts.get("token-basics"), 1);
  setCachedIndexForTesting(null);
});

test("countsBySection: outgoing count attaches to the first H2 anchor", () => {
  seedIndex();
  const counts = countsBySection(THIS_PATH, THIS_TEXT, 4);
  assert.equal(counts.get("token-basics"), 1 + 4);
  setCachedIndexForTesting(null);
});

test("incomingForFile + countsBySection: a DERIVED (no explicit {#anchor}) section slug still resolves incoming references", () => {
  const path = "foundations/src/usage-guide.md";
  // "## Usage" has no explicit {#usage} marker; the slug is derived.
  const text = "## Usage\n\nBody.\n";
  const referrer = "content/src/patterns/forms.md";
  setCachedIndexForTesting({
    entries: new Map([
      ["usage", { slug: "usage", definedIn: [], referencedBy: [referrer] }],
    ]),
    scannedAt: 0,
    scannedPaths: [path, referrer],
    texts: new Map([
      [
        referrer,
        "See [usage guidance](../foundations/usage-guide#usage) for details.",
      ],
    ]),
  });

  const incoming = incomingForFile(path, text);
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0]!.fromPath, referrer);
  assert.equal(incoming[0]!.slug, "usage");
  assert.ok(incoming[0]!.snippet.includes("usage guidance"));

  const counts = countsBySection(path, text, 0);
  assert.equal(counts.get("usage"), 1);
  setCachedIndexForTesting(null);
});

test('incomingForFile: a JSON referrer with no cached text (FIX 5: only .md text is cached) degrades to snippet: ""', () => {
  setCachedIndexForTesting({
    entries: new Map([
      [
        "token-basics",
        {
          slug: "token-basics",
          definedIn: [THIS_PATH],
          referencedBy: ["components/dist/guidelines/button.json"],
        },
      ],
    ]),
    scannedAt: 0,
    scannedPaths: [THIS_PATH, "components/dist/guidelines/button.json"],
    // Only the .md path's text is cached: mirrors loadAnchorIndex's
    // texts.set gate (JSON substrate files still count as incoming but
    // never yield a readable snippet).
    texts: new Map([[THIS_PATH, THIS_TEXT]]),
  });
  const incoming = incomingForFile(THIS_PATH, THIS_TEXT);
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0]!.fromPath, "components/dist/guidelines/button.json");
  assert.equal(incoming[0]!.snippet, "");
  setCachedIndexForTesting(null);
});

test("countsBySection: a co-definer of the same slug still counts as incoming", () => {
  setCachedIndexForTesting({
    entries: new Map([
      [
        "token-basics",
        {
          slug: "token-basics",
          definedIn: ["foundations/src/tokens.md", "foundations/src/other.md"],
          referencedBy: ["foundations/src/other.md"],
        },
      ],
    ]),
    scannedAt: 0,
    scannedPaths: [],
    texts: new Map(),
  });
  const counts = countsBySection(
    "foundations/src/tokens.md",
    "## Tokens {#token-basics}\n\nBody.\n",
    0,
  );
  assert.equal(counts.get("token-basics"), 1);
  setCachedIndexForTesting(null);
});

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
