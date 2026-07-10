import { test } from "node:test";
import assert from "node:assert/strict";
import { setCachedIndexForTesting } from "../../src/lib/anchorIndex";
import {
  incomingForFile,
  countsBySection,
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

test("incomingForFile: empty when index not loaded", () => {
  setCachedIndexForTesting(null);
  assert.deepEqual(incomingForFile(THIS_PATH, THIS_TEXT), []);
});

test("countsBySection: incoming count lands on the defining section anchor", () => {
  seedIndex();
  const counts = countsBySection(THIS_TEXT, 0);
  assert.equal(counts.get("token-basics"), 1);
  setCachedIndexForTesting(null);
});

test("countsBySection: outgoing count attaches to the first H2 anchor", () => {
  seedIndex();
  const counts = countsBySection(THIS_TEXT, 4);
  assert.equal(counts.get("token-basics"), 1 + 4);
  setCachedIndexForTesting(null);
});
