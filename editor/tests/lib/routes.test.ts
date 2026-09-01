import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  hashFor,
  pathFromHash,
  exploreTabFromHash,
  titleFor,
} from "../../src/lib/routes";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";
import { isPlainMarkdown } from "../../src/app/EditorShell";

/** Every pair the segment table is meant to carry: activePath <-> hash. */
const PAIRS: ReadonlyArray<readonly [string | null, string]> = [
  // Screens that are not a file.
  [null, "#/"],
  ["inbox", "#/drafts"],

  // A component: its workspace, its five domains, its metadata.
  ["workspace/button", "#/component/button"],
  ["components/src/button/content.md", "#/component/button/content"],
  ["components/src/button/usage.md", "#/component/button/usage"],
  ["components/src/button/design.md", "#/component/button/design"],
  ["components/src/button/behavior.md", "#/component/button/behavior"],
  ["components/src/button/tokens.yml", "#/component/button/tokens"],
  ["components/src/button/_meta.yml", "#/component/button/meta"],

  // Categories sit inside components/src but are not a component.
  ["components/src/categories/form.md", "#/category/form"],

  // Design system domains.
  ["foundations/src/tokens.md", "#/foundations/tokens"],
  ["accessibility/src/color-contrast.md", "#/accessibility/color-contrast"],

  // Content, named as the sidebar names it.
  ["content/src/writing/capitalization.md", "#/writing/capitalization"],
  ["content/src/patterns/forms.md", "#/pattern/forms"],
  [
    "content/src/product/related-content-panels.md",
    "#/product/related-content-panels",
  ],
  ["content/src/global-guidelines.md", "#/content/global-guidelines"],

  // Application context. `patterns/` is labelled Features in the nav, which is
  // what keeps it from colliding with the content patterns above.
  ["app-context/src/apps/studio.md", "#/app/studio"],
  ["app-context/src/entities/data-product.md", "#/entity/data-product"],
  ["app-context/src/patterns/import-wizard.md", "#/feature/import-wizard"],
];

for (const [path, hash] of PAIRS) {
  test(`hashFor: ${path ?? "home"} -> ${hash}`, () => {
    assert.equal(hashFor(path), hash);
  });
  test(`pathFromHash: ${hash} -> ${path ?? "home"}`, () => {
    assert.equal(pathFromHash(hash), path);
  });
}

test("hashFor: a path no segment claims falls back to the raw path", () => {
  assert.equal(
    hashFor("app-context/src/recipes/catalog-browse.md"),
    "#/file/app-context/src/recipes/catalog-browse.md",
  );
});

test("pathFromHash: the fallback hash resolves back to the raw path", () => {
  assert.equal(
    pathFromHash("#/file/app-context/src/recipes/catalog-browse.md"),
    "app-context/src/recipes/catalog-browse.md",
  );
});

test("pathFromHash: an unreadable hash lands on home, not on a blank pane", () => {
  assert.equal(pathFromHash("#/nonsense/xyz"), null);
  assert.equal(pathFromHash(""), null);
  assert.equal(pathFromHash("#"), null);
});

// ---------------------------------------------------------------------------
// The corpus gates. These walk the real repository rather than a list written
// here, so a domain that gains a directory shows up as a failure instead of as
// a link that quietly opens the wrong thing.
// ---------------------------------------------------------------------------

const REPO = new URL("../../../", import.meta.url).pathname;
const SRC_DIRS = [
  "components/src",
  "foundations/src",
  "content/src",
  "accessibility/src",
  "app-context/src",
];

function corpus(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(REPO, rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else if (/\.(md|yml)$/.test(e.name)) out.push(child);
    }
  };
  for (const d of SRC_DIRS) walk(d);
  return out;
}

test("corpus: every authorable file round-trips through its hash", () => {
  const broken = corpus().filter((p) => pathFromHash(hashFor(p)) !== p);
  assert.deepEqual(broken, [], "these paths do not survive the round trip");
});

test("corpus: no two files share a hash", () => {
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const p of corpus()) {
    const h = hashFor(p);
    const first = seen.get(h);
    if (first) collisions.push(`${h} <- ${first} AND ${p}`);
    else seen.set(h, p);
  }
  assert.deepEqual(collisions, [], "two paths resolve to one address");
});

test("corpus: everything the editor can open has a readable address", () => {
  // The oracle is the editor's own dispatch, not a list kept here: if
  // EditorShell will render an edit screen for a path, that path must get a
  // named address rather than the raw-path fallback.
  const openable = (p: string) =>
    matchFrontmatterForm(p) != null ||
    isPlainMarkdown(p) ||
    /^components\/src\/[^/]+\/_meta\.yml$/.test(p);
  const unnamed = corpus().filter(
    (p) => openable(p) && hashFor(p).startsWith("#/file/"),
  );
  assert.deepEqual(unnamed, [], "these open in the editor but have no address");
});

test("corpus: the gate can fail (positive control)", () => {
  // Proof the three gates above are not tautological: a path shape the table
  // does not claim takes the fallback, and the fallback is detectable.
  assert.ok(hashFor("some/unmapped/place/thing.md").startsWith("#/file/"));
  assert.notEqual(hashFor("components/src/button/content.md"), "#/file/");
});

// ---------------------------------------------------------------------------
// The home screen's data tab, and the document title.
// ---------------------------------------------------------------------------

test("hashFor: the default home tab keeps the bare home address", () => {
  assert.equal(hashFor(null, "coverage"), "#/");
});

test("hashFor: a chosen home tab is addressable", () => {
  assert.equal(hashFor(null, "patterns"), "#/explore/patterns");
  assert.equal(hashFor(null, "relationships"), "#/explore/relationships");
});

test("hashFor: a file ignores the tab, which only qualifies home", () => {
  assert.equal(
    hashFor("components/src/button/content.md", "patterns"),
    "#/component/button/content",
  );
});

test("exploreTabFromHash: an explore address names its tab", () => {
  assert.equal(exploreTabFromHash("#/explore/patterns"), "patterns");
  assert.equal(exploreTabFromHash("#/explore/accessibility"), "accessibility");
});

test("exploreTabFromHash: anything else names no tab", () => {
  assert.equal(exploreTabFromHash("#/"), null);
  assert.equal(exploreTabFromHash("#/accessibility/color-contrast"), null);
  assert.equal(exploreTabFromHash("#/explore/nonsense"), null);
});

test("pathFromHash: an explore address is still the home screen", () => {
  assert.equal(pathFromHash("#/explore/patterns"), null);
});

test("titleFor: a component reads as its name, not its slug", () => {
  assert.equal(
    titleFor("components/src/data-product/content.md"),
    "Data Product · Actian DS Knowledge Editor",
  );
});

test("titleFor: the home screen is the product name alone", () => {
  assert.equal(titleFor(null), "Actian DS Knowledge Editor");
});

test("titleFor: a record reads as its own name", () => {
  assert.equal(
    titleFor("app-context/src/entities/data-product.md"),
    "Data Product · Actian DS Knowledge Editor",
  );
  assert.equal(titleFor("inbox"), "Drafts · Actian DS Knowledge Editor");
});

test("pathFromHash: a fallback address with no path is home, not an empty file", () => {
  assert.equal(pathFromHash("#/file/"), null);
  assert.equal(pathFromHash("#/file"), null);
});
