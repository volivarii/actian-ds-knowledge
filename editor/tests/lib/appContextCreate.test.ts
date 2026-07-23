import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAppStub, addAppToApps } from "../../src/lib/appContextCreate";

// ── buildAppStub ────────────────────────────────────────────────────────

test("the stub carries the schema-required frontmatter", () => {
  const out = buildAppStub({ slug: "data-connect", label: "Data Connect" });
  assert.match(out, /^---\n/);
  assert.match(out, /^_schema_version: 1$/m);
  assert.match(out, /^slug: data-connect$/m);
  assert.match(out, /^label: Data Connect$/m);
  assert.match(out, /^header:\n {2}type: Data Connect$/m);
  assert.match(out, /^sidebar: \[\]$/m);
});

test("the header type can differ from the label", () => {
  const out = buildAppStub({
    slug: "data-connect",
    label: "Data Connect",
    headerType: "Studio",
  });
  assert.match(out, /^header:\n {2}type: Studio$/m);
});

test("a label needing YAML quoting is quoted", () => {
  const out = buildAppStub({ slug: "x", label: "Data: Connect" });
  assert.match(out, /^label: "Data: Connect"$/m);
});

test("the stub carries the three canonical sections", () => {
  const out = buildAppStub({ slug: "x", label: "X" });
  assert.match(out, /^## Purpose$/m);
  assert.match(out, /^## Users$/m);
  assert.match(out, /^## Signals$/m);
});

// The derive reads Purpose with sectionProse (joins EVERY non-blank line in
// the section) and Users/Signals with sectionBullets. So any placeholder prose
// or comment left in a section would derive into the product's real purpose /
// users / signals and travel to consumers. Body lines must be headings or
// blank, which is exactly "every section derives empty".
test("no placeholder prose can leak into the derived record", () => {
  const out = buildAppStub({ slug: "x", label: "X" });
  const body = out.split(/^---$/m)[2] ?? "";
  for (const line of body.split("\n")) {
    assert.ok(
      line.trim() === "" || /^## /.test(line),
      `body line is neither blank nor a heading: ${JSON.stringify(line)}`,
    );
  }
});

// ── addAppToApps ────────────────────────────────────────────────────────

const ENTITY = `---
_schema_version: 1
slug: dataset
label: Dataset
apps:
  - studio
  - explorer
---
Prose about datasets.
`;

test("appends the app to a block-style apps list", () => {
  assert.equal(
    addAppToApps(ENTITY, "data-connect"),
    `---
_schema_version: 1
slug: dataset
label: Dataset
apps:
  - studio
  - explorer
  - data-connect
---
Prose about datasets.
`,
  );
});

test("is idempotent — an already-listed app returns the text byte-identical", () => {
  assert.equal(addAppToApps(ENTITY, "studio"), ENTITY);
});

test("appends to a flow-style apps list", () => {
  const src = "---\nslug: x\napps: [studio, explorer]\n---\nbody\n";
  assert.equal(
    addAppToApps(src, "data-connect"),
    "---\nslug: x\napps: [studio, explorer, data-connect]\n---\nbody\n",
  );
});

test("appends to an empty flow-style apps list", () => {
  const src = "---\nslug: x\napps: []\n---\nbody\n";
  assert.equal(
    addAppToApps(src, "data-connect"),
    "---\nslug: x\napps: [data-connect]\n---\nbody\n",
  );
});

test("an apps key with no items yet takes the first item", () => {
  const src = "---\nslug: x\napps:\ncomponents:\n  - button\n---\nbody\n";
  assert.equal(
    addAppToApps(src, "data-connect"),
    "---\nslug: x\napps:\n  - data-connect\ncomponents:\n  - button\n---\nbody\n",
  );
});

test("keeps other frontmatter keys and the body untouched", () => {
  const src = `---
slug: lineage-graph
apps:
  - studio
components:
  - lineage-individual-node
---
Directional data-flow graph.
`;
  const out = addAppToApps(src, "data-connect");
  assert.match(out ?? "", /^components:\n {2}- lineage-individual-node$/m);
  assert.match(out ?? "", /^Directional data-flow graph\.$/m);
});

// The body is off limits by construction: only the frontmatter region is
// rewritten, so an `apps:` block quoted in prose stays as the author wrote it.
test("never rewrites an apps block in the body", () => {
  const src = `---
slug: x
apps:
  - studio
---
Example frontmatter:

    apps:
      - studio
`;
  const out = addAppToApps(src, "data-connect");
  assert.ok(out !== null);
  assert.equal(
    out.split(/^---$/m)[2],
    src.split(/^---$/m)[2],
    "body changed",
  );
  assert.match(out, /^ {2}- data-connect$/m);
});

test("a nested apps key is not mistaken for the top-level one", () => {
  const src = `---
slug: studio
useCases:
  - audience: [Data steward]
    apps: [ignored]
apps:
  - studio
---
body
`;
  const out = addAppToApps(src, "data-connect");
  assert.match(out ?? "", /^ {4}apps: \[ignored\]$/m);
  assert.match(out ?? "", /^apps:\n {2}- studio\n {2}- data-connect$/m);
});

test("returns null when the record has no apps key to join", () => {
  assert.equal(addAppToApps("---\nslug: x\n---\nbody\n", "data-connect"), null);
});

test("returns null when there is no frontmatter at all", () => {
  assert.equal(addAppToApps("just prose\n", "data-connect"), null);
});
