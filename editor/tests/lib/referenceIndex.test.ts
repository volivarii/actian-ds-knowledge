import { test } from "node:test";
import assert from "node:assert/strict";
import { setCachedIndexForTesting } from "../../src/lib/anchorIndex";
import {
  sectionAnchors,
  incomingForFile,
  countsBySection,
  searchReferenceTargets,
} from "../../src/lib/referenceIndex";
import { incomingFiles } from "../../src/lib/incomingFiles";

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

// ── #684 consistency: the pill and the rail reconcile, they do not match ────
//
// Written first as "the pill equals the rail's rows", which was wrong twice:
// it made the pill drop to zero for the nine anchors in
// `accessibility/src/components.md` whose only indexed referrers are generated
// (the index scans .md and dist JSON, never `_meta.yml`), and it could not
// fail on the first H2, where the pill deliberately carries the file's
// outgoing count too.
//
// The true relation, and the one worth guarding:
//
//   pill(anchor) = rail rows + generated excluded + (outgoing, first H2 only)
//
// Each term is visible on screen: the rows, the "N generated files also
// reference this" note, and the "References (N)" section. So a reader can
// reconcile the two numbers even though they differ.

const JOIN_PATH = "foundations/src/tokens.md";
const JOIN_TEXT =
  "## Tokens {#token-basics}\n\nBody.\n\n## Motion {#motion-basics}\n\nMore.\n";

function seedJoinIndex() {
  setCachedIndexForTesting({
    entries: new Map([
      [
        "token-basics",
        {
          slug: "token-basics",
          definedIn: [JOIN_PATH],
          referencedBy: [
            // overlays.md mentions this anchor in TWO paragraphs below, and
            // incomingForFile pushes one row per snippet, so this file yields
            // two rail rows for one anchor. Without that, a fixture of
            // distinct paths makes "group by file" and "do not group" agree
            // and the grouping half of the join cannot fail.
            "components/src/categories/overlays.md",
            "components/src/categories/form.md",
            "foundations/dist/foundations.bundle.json",
            JOIN_PATH,
          ],
        },
      ],
      [
        "motion-basics",
        {
          slug: "motion-basics",
          definedIn: [JOIN_PATH],
          referencedBy: ["components/src/categories/action.md"],
        },
      ],
    ]),
    scannedAt: 0,
    scannedPaths: [JOIN_PATH],
    texts: new Map([
      [
        "components/src/categories/overlays.md",
        "First para links [tokens](../foundations/tokens#token-basics) here.\n\n" +
          "Second para links [tokens again](../foundations/tokens#token-basics) too.\n",
      ],
      [
        "components/src/categories/form.md",
        "Only para links [tokens](../foundations/tokens#token-basics) once.\n",
      ],
      [
        "components/src/categories/action.md",
        "A para links [motion](../foundations/tokens#motion-basics) once.\n",
      ],
      ["foundations/dist/foundations.bundle.json", "{}"],
    ]),
  });
}

test("countsBySection: a generated referrer still counts, because something does depend on the section", () => {
  seedJoinIndex();
  const counts = countsBySection(JOIN_PATH, JOIN_TEXT, 0);
  // overlays + form + the dist bundle. Self-reference excluded, as before.
  assert.equal(counts.get("token-basics"), 3);
  setCachedIndexForTesting(null);
});

test("the pill reconciles with the rail: rows + generated excluded, on a non-first anchor", () => {
  seedJoinIndex();
  const counts = countsBySection(JOIN_PATH, JOIN_TEXT, 0);
  const all = incomingForFile(JOIN_PATH, JOIN_TEXT);

  for (const anchor of ["token-basics", "motion-basics"]) {
    const { files, generatedExcluded } = incomingFiles(
      all.filter((r) => r.slug === anchor),
    );
    assert.equal(
      counts.get(anchor) ?? 0,
      files.length + generatedExcluded,
      `#${anchor}: pill ${counts.get(anchor) ?? 0} != rows ${files.length} + excluded ${generatedExcluded}`,
    );
  }
  // Not two zeroes agreeing: the token-basics side is 2 rows over 4 refs plus
  // 1 excluded, so both the grouping and the exclusion term are load-bearing.
  const scoped = incomingFiles(
    all.filter((r) => r.slug === "token-basics"),
  );
  assert.equal(scoped.files.length, 2);
  assert.equal(scoped.generatedExcluded, 1);
  setCachedIndexForTesting(null);
});

test("the first H2's pill carries the outgoing count too, which the rail shows in its own section", () => {
  // The case the previous version of this gate could not reach: it passed
  // outgoingCount 0 for every anchor, so the one place the naive "pill equals
  // rows" invariant is KNOWN to break was the one place it never looked.
  seedJoinIndex();
  const outgoing = 4;
  const counts = countsBySection(JOIN_PATH, JOIN_TEXT, outgoing);
  const all = incomingForFile(JOIN_PATH, JOIN_TEXT);

  const first = incomingFiles(all.filter((r) => r.slug === "token-basics"));
  assert.equal(
    counts.get("token-basics"),
    first.files.length + first.generatedExcluded + outgoing,
    "the first H2 pill is incoming files + generated excluded + outgoing",
  );

  // And only the first H2 takes the outgoing term.
  const second = incomingFiles(all.filter((r) => r.slug === "motion-basics"));
  assert.equal(
    counts.get("motion-basics"),
    second.files.length + second.generatedExcluded,
  );
  setCachedIndexForTesting(null);
});

// ── An anchor that is "" is not an anchor ───────────────────────────────────
//
// `extractAnchor` -> `deriveSlug` yields "" for an H2 whose title has no
// [a-z0-9] left after the numeric-prefix strip: "## 🎯", "## ---", "## 3.".
// The type says `string | null`, so callers guard on `=== null` and let ""
// through. Two consequences, both silent:
//
//   * countsBySection latches firstH2Anchor = "", and the later
//     `if (firstH2Anchor && outgoingCount > 0)` is falsy — so the outgoing
//     count is dropped for the WHOLE FILE rather than moving to the next H2,
//     and the join formula's third term quietly becomes zero.
//   * RelationsPanel sets scopedAnchor = "", which is falsy where it filters,
//     so the row paints as scoped while the rail keeps showing everything and
//     the "All" button never appears.
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

test("countsBySection: an unanchored first H2 does not swallow the file's outgoing count", () => {
  const path = "foundations/src/tokens.md";
  // The first H2 derives to "", so before the fix firstH2Anchor latched onto
  // it and the outgoing term was lost for every section in the file.
  // NOT "## 3." — that derives to "3", a perfectly good anchor. Verified
  // against deriveSlug: an emoji-only or punctuation-only title is what
  // empties out.
  const text = "## 🎯\n\nBody.\n\n## Tokens {#token-basics}\n\nMore.\n";
  setCachedIndexForTesting({
    entries: new Map([
      [
        "token-basics",
        { slug: "token-basics", definedIn: [path], referencedBy: [] },
      ],
    ]),
    scannedAt: 0,
    scannedPaths: [path],
    texts: new Map(),
  });
  const counts = countsBySection(path, text, 4);
  assert.equal(
    counts.get("token-basics"),
    4,
    "the outgoing count lands on the first H2 that actually has an anchor",
  );
  setCachedIndexForTesting(null);
});
