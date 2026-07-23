import { test } from "node:test";
import assert from "node:assert/strict";
import { createProduct } from "../../src/lib/createProduct";
import type { ContextRecord } from "../../src/lib/contextRecords";

const DATASET: ContextRecord = {
  kind: "entity",
  slug: "dataset",
  label: "Dataset",
  path: "app-context/src/entities/dataset.md",
  usedBy: ["Studio"],
};

const DATASET_FILE = `---
slug: dataset
label: Dataset
apps:
  - studio
---
Prose.
`;

interface Staged {
  path: string;
  content: string;
  basedOnSha: string;
}

function harness(
  remote: Record<string, { text: string; sha: string }>,
  cart: Record<string, { content: string; sha: string }> = {},
) {
  const staged: Staged[] = [];
  return {
    staged,
    deps: {
      readFile: async (path: string) => {
        const hit = remote[path];
        if (!hit) throw new Error(`404 ${path}`);
        return hit;
      },
      stage: (entry: Staged) => staged.push(entry),
      stagedContent: (path: string) => cart[path] ?? null,
    },
  };
}

const VALUE = {
  label: "Data Connect",
  slug: "data-connect",
  headerType: "Data Connect",
  claim: [] as ContextRecord[],
};

test("stages the new product file as a new file", async () => {
  const h = harness({});
  const result = await createProduct(VALUE, h.deps);

  assert.equal(result.appPath, "app-context/src/apps/data-connect.md");
  const app = h.staged.find((s) => s.path === result.appPath);
  assert.ok(app);
  assert.equal(app.basedOnSha, "", "a new file has no remote base");
  assert.match(app.content, /^slug: data-connect$/m);
  assert.match(app.content, /^label: Data Connect$/m);
});

test("joins each claimed record, based on its remote sha", async () => {
  const h = harness({
    [DATASET.path]: { text: DATASET_FILE, sha: "sha-dataset" },
  });
  const result = await createProduct({ ...VALUE, claim: [DATASET] }, h.deps);

  const edit = h.staged.find((s) => s.path === DATASET.path);
  assert.ok(edit);
  assert.equal(edit.basedOnSha, "sha-dataset");
  assert.match(edit.content, /^apps:\n {2}- studio\n {2}- data-connect$/m);
  assert.deepEqual(result.joined, [DATASET.path]);
  assert.deepEqual(result.failed, []);
});

// Chained creates in one batch: the second product must build on the first
// product's staged edit, not on the untouched remote, or it silently drops it.
test("builds on a staged edit when the batch already holds one", async () => {
  const alreadyStaged = DATASET_FILE.replace(
    "  - studio\n",
    "  - studio\n  - explorer\n",
  );
  const h = harness(
    { [DATASET.path]: { text: DATASET_FILE, sha: "sha-dataset" } },
    { [DATASET.path]: { content: alreadyStaged, sha: "sha-dataset" } },
  );
  await createProduct({ ...VALUE, claim: [DATASET] }, h.deps);

  const edit = h.staged.find((s) => s.path === DATASET.path);
  assert.ok(edit);
  assert.match(edit.content, /- studio\n {2}- explorer\n {2}- data-connect/);
});

test("a record already listing the product is reported, not restaged", async () => {
  const already = DATASET_FILE.replace(
    "  - studio\n",
    "  - studio\n  - data-connect\n",
  );
  const h = harness({ [DATASET.path]: { text: already, sha: "sha-dataset" } });
  const result = await createProduct({ ...VALUE, claim: [DATASET] }, h.deps);

  assert.deepEqual(result.unchanged, [DATASET.path]);
  assert.equal(
    h.staged.find((s) => s.path === DATASET.path),
    undefined,
    "a no-op edit must not enter the pull request",
  );
});

test("a record with no apps list to join is reported as failed", async () => {
  const h = harness({
    [DATASET.path]: { text: "---\nslug: dataset\n---\nProse.\n", sha: "s" },
  });
  const result = await createProduct({ ...VALUE, claim: [DATASET] }, h.deps);

  assert.deepEqual(result.failed, [
    { path: DATASET.path, label: "Dataset" },
  ]);
  assert.equal(h.staged.find((s) => s.path === DATASET.path), undefined);
});

// One unreadable record must not cost the author the whole product.
test("an unreadable record fails alone; the product is still staged", async () => {
  const h = harness({});
  const result = await createProduct({ ...VALUE, claim: [DATASET] }, h.deps);

  assert.equal(result.failed.length, 1);
  assert.ok(h.staged.some((s) => s.path === result.appPath));
});
