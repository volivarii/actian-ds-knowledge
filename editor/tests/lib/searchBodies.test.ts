import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bodyEntries,
  bodySnippet,
  type SearchBodyDoc,
} from "../../src/lib/searchBodies";
import {
  buildSearchIndex,
  searchCorpus,
  type SearchItem,
} from "../../src/lib/searchIndex";
import { hashFor, ADDRESSED_DIRS } from "../../src/lib/routes";
import { parse as parseYaml } from "yaml";
import generated from "../../src/generated/search-bodies.json";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AUTHORABLE = new Set(["button", "modal"]);
const TITLED: SearchItem[] = [
  { title: "Buttons", kind: "component", path: "workspace/button" },
  { title: "Forms", kind: "content", path: "content/src/patterns/forms.md" },
];
const doc = (path: string, text = "Use sentence case."): SearchBodyDoc => ({
  path,
  text,
});

test("a component's guidance opens that document, not the workspace", () => {
  const [entry] = bodyEntries(
    [doc("components/src/button/content.md")],
    AUTHORABLE,
    TITLED,
  );
  assert.ok(entry);
  assert.equal(entry.item.path, "components/src/button/content.md");
  assert.equal(entry.item.title, "Buttons"); // reused from the title index
  assert.equal(entry.item.sub, "Content");
  assert.equal(entry.item.kind, "component");
  // The path it carries is the one the address table names.
  assert.equal(hashFor(entry.item.path), "#/component/button/content");
});

test("a component the sidebar will not show is not offered", () => {
  const rows = bodyEntries(
    [doc("components/src/not-authorable/content.md")],
    AUTHORABLE,
    TITLED,
  );
  assert.deepEqual(rows, []);
});

test("a file the editor cannot open is not offered", () => {
  // hashFor gives these the #/file/ fallback, and opening one shows the
  // refusal banner, so a result row would be a dead end.
  for (const path of [
    "components/src/AUTHORING.md",
    "components/src/EDITING-GUIDE.md",
  ]) {
    assert.deepEqual(bodyEntries([doc(path)], AUTHORABLE, TITLED), [], path);
  }
});

test("categories stay out, matching the title index", () => {
  // They are addressable, but no category is findable BY NAME today; making
  // one findable by its body alone would be the more confusing half.
  assert.deepEqual(
    bodyEntries([doc("components/src/categories/action.md")], AUTHORABLE, TITLED),
    [],
  );
});

test("a document that already has a name keeps it", () => {
  const [entry] = bodyEntries(
    [doc("content/src/patterns/forms.md")],
    AUTHORABLE,
    TITLED,
  );
  assert.equal(entry!.item.title, "Forms");
  assert.equal(entry!.item.kind, "content");
});

test("a document with no title index entry is named from its slug", () => {
  const [entry] = bodyEntries(
    [doc("content/src/writing/voice-and-tone.md")],
    AUTHORABLE,
    [],
  );
  assert.equal(entry!.item.title, "Voice and tone");
  assert.equal(entry!.item.kind, "content");
});

test("the snippet shows the matched phrase in its sentence", () => {
  const text =
    "Buttons trigger actions in the product. Style Use sentence case for all button labels and keep them short.";
  const snip = bodySnippet(
    { text, lower: text.toLowerCase() },
    "sentence case",
  );
  assert.ok(snip);
  assert.ok(snip!.toLowerCase().includes("sentence case"), snip!);
  assert.ok(snip!.startsWith("…"), "elided from the left when it starts inside");
  assert.ok(snip!.length < text.length, "not the whole document");
});

test("no snippet when the phrase is not there", () => {
  const text = "Buttons trigger actions.";
  assert.equal(
    bodySnippet({ text, lower: text.toLowerCase() }, "sentence case"),
    null,
  );
  assert.equal(bodySnippet({ text, lower: text.toLowerCase() }, "  "), null);
});

// ── The corpus, as generated ────────────────────────────────────────────────

const DOCS = (generated as { docs: SearchBodyDoc[] }).docs;

test("the generated corpus covers every tree the editor can address", () => {
  // Named trees, not a count: the failure this catches is a tree silently
  // dropping out of the walk, which a total would let a growing tree mask.
  // app-context is here by name because the repo's other corpus walker
  // (scripts/lib/wysiwyg-registry.js) omits it, so reusing that one would
  // have lost all 64 Products, Entities and Features without a red test.
  const trees = new Set(DOCS.map((d) => d.path.split("/").slice(0, 2).join("/")));
  for (const tree of [
    "components/src",
    "foundations/src",
    "accessibility/src",
    "app-context/src",
    "content/src",
  ])
    assert.ok(trees.has(tree), `${tree} missing from the search corpus`);
});

test("every kind the header groups by is reachable by body text", () => {
  const kinds = new Set(
    bodyEntries(DOCS, new Set(["button"]), []).map((e) => e.item.kind),
  );
  for (const k of ["component", "foundation", "content", "accessibility", "app-context"] as const)
    assert.ok(kinds.has(k), `no body results possible for ${k}`);
});

test("F2: a phrase written in the guidance is findable and opens the file it is in", () => {
  // The finding's own example. "sentence case" is a rule stated verbatim in
  // components/src/button/content.md and returned nothing at all.
  const index = buildSearchIndex(new Set(["button"]));
  const entries = bodyEntries(DOCS, new Set(["button"]), index);

  assert.equal(
    searchCorpus(index, "sentence case").length,
    0,
    "precondition: titles alone still find nothing, which is the defect",
  );

  const groups = searchCorpus(index, "sentence case", 6, entries);
  const rows = groups.flatMap((g) => g.items);
  const hit = rows.find((r) => r.path === "components/src/button/content.md");
  assert.ok(hit, `button content.md not among ${rows.length} results`);
  assert.ok(
    hit!.snippet?.toLowerCase().includes("sentence case"),
    `snippet should show the phrase, got: ${hit!.snippet}`,
  );
});

test("a document offered by name is not offered twice", () => {
  const index: SearchItem[] = [
    { title: "Forms", kind: "content", path: "content/src/patterns/forms.md" },
  ];
  const entries = bodyEntries(
    [doc("content/src/patterns/forms.md", "Forms are the thing.")],
    AUTHORABLE,
    index,
  );
  const rows = searchCorpus(index, "forms", 6, entries).flatMap((g) => g.items);
  assert.equal(
    rows.filter((r) => r.path === "content/src/patterns/forms.md").length,
    1,
    "the same file matched by title AND body should be one row",
  );
});

test("a title match outranks a body match for the same word", () => {
  // The body row is titled so it sorts FIRST alphabetically, so only the rank
  // can put the named document above it. Ranking them equally, or comparing
  // two rows that happen to share a title, would let this hold by accident.
  const index: SearchItem[] = [
    { title: "Zebra", kind: "content", path: "content/src/writing/zebra.md" },
  ];
  const entries = bodyEntries(
    [doc("content/src/writing/alpha.md", "This one merely mentions zebra.")],
    AUTHORABLE,
    index,
  );
  const rows = searchCorpus(index, "zebra", 6, entries).flatMap((g) => g.items);
  assert.equal(rows.length, 2, "both rows should be offered");
  assert.equal(rows[0]!.title, "Zebra");
  assert.ok(!rows[0]!.snippet, "the top row for a name is the name itself");
  assert.ok(rows[1]!.snippet, "the body row keeps its reason");
});

test("the corpus stays out of the entry chunk", () => {
  // The whole reason it is a dynamic import: a STATIC one anywhere under src/
  // folds 330 KB of prose into the bundle every cold load pays for, and
  // nothing else would go red — search would simply be slower to start.
  const SRC = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "src",
  );
  const STATIC_IMPORT =
    /^\s*import\s[^;]*["'][^"']*generated\/search-bodies\.json["']/m;
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) {
        if (STATIC_IMPORT.test(readFileSync(full, "utf8")))
          offenders.push(path.relative(SRC, full));
      }
    }
  };
  walk(SRC);
  assert.deepEqual(offenders, [], `static import of the body corpus`);
});

test("the workflows that build the corpus fire on every tree it is built from", () => {
  // ADDRESSED_DIRS is derived from the address table so that a new section
  // cannot be addressable and unsearchable at once. The two workflows restate
  // that list by hand, and nothing joined them: adding a row to DIRS made the
  // new tree searchable locally and in CI while a content-only merge under it
  // never redeployed, so the deployed index went stale with no red anywhere.
  // The symptom is a phrase that is on the page and not in search.
  const REPO = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
  );
  const covers = (entry: string, dir: string): boolean => {
    const prefix = entry.replace(/\/\*\*$/, "").replace(/\/$/, "");
    return dir === prefix || dir.startsWith(`${prefix}/`);
  };
  for (const wf of ["editor-deploy.yml", "editor-ci.yml"]) {
    const doc = parseYaml(
      readFileSync(path.join(REPO, ".github/workflows", wf), "utf8"),
    ) as { on?: Record<string, { paths?: string[] }> };
    // `on:` is YAML 1.1 truthy, so a parser may hand it back under `true`.
    const on = (doc.on ?? (doc as Record<string, unknown>)["true"]) as Record<
      string,
      { paths?: string[] }
    >;
    const trigger = on["pull_request"] ?? on["push"];
    const paths = trigger?.paths;
    assert.ok(paths?.length, `${wf}: no paths filter found to check`);
    const missing = ADDRESSED_DIRS.filter(
      (dir) => !paths!.some((entry) => covers(entry, dir)),
    );
    assert.deepEqual(
      missing,
      [],
      `${wf} does not fire on these trees the search corpus is built from`,
    );
  }
});
