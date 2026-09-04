import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";
import {
  assembleFrontmatterFilePreservingComments,
  isUnchangedFromSource,
} from "../../src/form-engine/yamlSerializer";
import { assembleFrontmatterFile } from "../../src/app/FrontmatterBodyEditScreen";
import { parseDocument as yamlParseForTest } from "yaml";

// #631: every file the registry routes to a form must be a BYTE fixed point of
// its own save path. It was 66 of 96; the 30 others came back reformatted, so
// the editor could not tell "the author reverted their edit" from "this file
// differs from main", and a reverted edit sat in the batch as a whitespace-only
// pull request.
//
// The corpus is walked, never listed: a new app-context record or content page
// is covered the day it lands, and a domain that gains a form entry widens this
// on its own.
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const SKIP = new Set(["node_modules", ".git", "dist", "editor"]);

function walkMd(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkMd(full, out);
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Every routed file, with the config the editor would use for it. */
function routedFiles() {
  const out: { rel: string; cfg: NonNullable<ReturnType<typeof matchFrontmatterForm>> }[] = [];
  for (const full of walkMd(REPO)) {
    const rel = relative(REPO, full);
    const cfg = matchFrontmatterForm(rel);
    if (cfg) out.push({ rel, cfg });
  }
  return out;
}

/** The bytes the editor writes for a file nobody edited. */
function saveUnedited(rel: string, cfg: NonNullable<ReturnType<typeof matchFrontmatterForm>>) {
  const original = readFileSync(join(REPO, rel), "utf8");
  const split = splitFrontmatter(original);
  if (split.frontmatterText == null) return { original, rebuilt: null };
  const formData = split.data;
  const rebuilt = cfg.preserveComments
    ? assembleFrontmatterFilePreservingComments(formData, split.frontmatterText, split.body)
    : assembleFrontmatterFile(
        formData,
        split.frontmatterText,
        split.body,
        cfg.flowAtDepth === undefined ? 2 : cfg.flowAtDepth,
      );
  return { original, rebuilt };
}

// Scope: the `.md` files `matchFrontmatterForm` routes, which is #631's own
// subject. `components/src/*/_meta.yml` is edited by a DIFFERENT screen
// (MetaEditScreen -> stringifyYaml) that has no such shortcut and whose files
// are CRLF; none of them is a fixed point today, and nothing here would go red
// for them.
test("every form-routed .md file is a byte fixed point of its own save path (#631)", () => {
  const files = routedFiles();
  // The floor is the guard's own subject: a walk that stopped finding files
  // would otherwise pass by iterating nothing.
  assert.ok(files.length > 80, `expected the real corpus, found ${files.length} routed files`);
  const broken: string[] = [];
  let compared = 0;
  for (const { rel, cfg } of files) {
    const { original, rebuilt } = saveUnedited(rel, cfg);
    if (rebuilt === null) continue; // no fence: not this guard's subject
    compared++;
    if (rebuilt !== original) {
      const o = original.split("\n");
      const r = rebuilt.split("\n");
      let i = 0;
      while (i < Math.min(o.length, r.length) && o[i] === r[i]) i++;
      broken.push(`${rel} line ${i + 1}: ${JSON.stringify(o[i] ?? "<eof>")} -> ${JSON.stringify(r[i] ?? "<eof>")}`);
    }
  }
  assert.ok(compared > 80, `expected to compare the corpus, compared ${compared}`);
  assert.deepEqual(broken, [], `${broken.length} of ${compared} files are not fixed points:\n  ${broken.join("\n  ")}`);
});

test("an edit is never swallowed by the unchanged shortcut", () => {
  // The dangerous direction. Returning the author's bytes is right ONLY when
  // nothing changed; if the comparison ever said "unchanged" for an edited
  // form, the save would silently write the old file back and the author's
  // work would vanish with a green save badge.
  const source = "slug: dataset\nlabel: Dataset\nproperties:\n  - { name: orphan, states: [Present, Orphan] }\n";
  const parsed = { slug: "dataset", label: "Dataset", properties: [{ name: "orphan", states: ["Present", "Orphan"] }] };
  assert.equal(isUnchangedFromSource(parsed, source), true, "an untouched form was read as edited");

  const edits: [string, unknown][] = [
    ["a changed scalar", { ...parsed, label: "Datasets" }],
    ["a removed key", { slug: "dataset", properties: parsed.properties }],
    ["an added key", { ...parsed, apps: ["studio"] }],
    ["a changed nested value", { ...parsed, properties: [{ name: "orphan", states: ["Present"] }] }],
    ["a reordered array", { ...parsed, properties: [{ name: "orphan", states: ["Orphan", "Present"] }] }],
  ];
  for (const [what, data] of edits) {
    assert.equal(isUnchangedFromSource(data, source), false, `${what} was read as unchanged`);
    const out = assembleFrontmatterFilePreservingComments(data, source, "body\n");
    assert.notEqual(out, `---\n${source}---\nbody\n`, `${what} was written back as the original bytes`);
    // Differing bytes are not enough: a save that reformatted the document
    // while dropping the edit would pass that. Assert the edit is IN there,
    // which is what a resurrected removed key would fail.
    assert.deepEqual(
      splitFrontmatter(out).data,
      data,
      `${what} did not survive into the saved file`,
    );
  }
});

test("a reorder cannot be written by this path, so it is not treated as an edit", () => {
  // Asserted because it looks like data loss and is not: `doc.set` replaces a
  // value in place and never moves a pair, so the merge path emits the
  // author's original order too. Calling a reorder an edit would buy a
  // reformat that changes nothing. The surface that CAN reorder is the YAML
  // source view, which writes the author's text verbatim.
  const source = "b: 2\na: 1\n";
  const reordered = { a: 1, b: 2 };
  assert.equal(isUnchangedFromSource(reordered, source), true, "a reorder was treated as an edit");
  const viaMerge = assembleFrontmatterFilePreservingComments(reordered, source, "body\n");
  assert.equal(viaMerge, "---\nb: 2\na: 1\n---\nbody\n", "the source order did not survive");
  // And the value edit that rides along with a reorder still lands.
  const alsoEdited = assembleFrontmatterFilePreservingComments({ a: 9, b: 2 }, source, "body\n");
  assert.equal(splitFrontmatter(alsoEdited).data!.a, 9, "an edit alongside a reorder was dropped");
});

test("a document yaml could not parse is refused, errors and all", () => {
  // `parseDocument` never throws: it returns a best-effort parse plus errors.
  // ": : not yaml [" comes back as {"": {"": "not yaml ["}}, so without
  // reading `doc.errors` a broken document is a valid comparison basis.
  const broken = ": : not yaml [";
  const doc = yamlParseForTest(broken);
  assert.ok(doc.errors.length > 0, "the fixture is not actually malformed any more");
  assert.equal(isUnchangedFromSource(doc.toJS(), broken), false, "a document with parse errors was accepted");
});

test("the shortcut refuses anything it cannot compare, rather than guessing", () => {
  // Any doubt must resolve to "serialize as before": a reformat is cosmetic,
  // a dropped edit is data loss.
  assert.equal(isUnchangedFromSource({ a: 1 }, null), false, "a null source was treated as unchanged");
  assert.equal(isUnchangedFromSource({ a: 1 }, ""), false, "an empty source was treated as unchanged");
  assert.equal(isUnchangedFromSource(null, "a: 1"), false, "null form data was treated as unchanged");
  assert.equal(isUnchangedFromSource([1, 2], "a: 1"), false, "an array was treated as unchanged");
  assert.equal(isUnchangedFromSource({ a: 1 }, ": : not yaml ["), false, "unparseable source was treated as unchanged");
});
