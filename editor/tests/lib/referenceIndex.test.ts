import { test } from "node:test";
import assert from "node:assert/strict";
import { setCachedIndexForTesting } from "../../src/lib/anchorIndex";
import { incomingForFile, countsBySection } from "../../src/lib/referenceIndex";

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
