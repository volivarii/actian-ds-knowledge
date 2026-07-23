import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createContextRecord,
  joinExistingRecord,
} from "../../src/lib/createContextRecord";

const PATH = "app-context/src/entities/dataset.md";
const FILE = `---
_schema_version: 1
slug: dataset
label: Dataset
apps:
  - studio
---
A collection of records.
`;

interface Staged {
  path: string;
  content: string;
  basedOnSha: string;
}

function harness(
  remote: Record<string, { text: string; sha: string }> = {},
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

// ── create ──────────────────────────────────────────────────────────────

test("creating an entity stages it as a new file under entities/", () => {
  const h = harness();
  const result = createContextRecord(
    {
      kind: "entity",
      slug: "data-contract",
      label: "Data Contract",
      apps: ["studio"],
    },
    h.deps,
  );
  assert.equal(result.path, "app-context/src/entities/data-contract.md");
  assert.equal(h.staged.length, 1);
  assert.equal(h.staged[0]!.basedOnSha, "");
  assert.match(h.staged[0]!.content, /^label: Data Contract$/m);
  assert.match(h.staged[0]!.content, /^apps:\n {2}- studio$/m);
});

test("creating a feature stages it under patterns/ with its components", () => {
  const h = harness();
  const result = createContextRecord(
    {
      kind: "feature",
      slug: "import-wizard",
      label: "Import wizard",
      apps: ["studio"],
      components: ["button", "table"],
    },
    h.deps,
  );
  assert.equal(result.path, "app-context/src/patterns/import-wizard.md");
  assert.match(h.staged[0]!.content, /^components:\n {2}- button\n {2}- table$/m);
});

// ── join an existing record (the collision path) ────────────────────────

test("joining adds every requested product in one staged edit", async () => {
  const h = harness({ [PATH]: { text: FILE, sha: "sha-1" } });
  const result = await joinExistingRecord(
    { path: PATH, label: "Dataset", apps: ["data-connect", "explorer"] },
    h.deps,
  );
  assert.equal(h.staged.length, 1, "one edit, not one per product");
  assert.equal(h.staged[0]!.basedOnSha, "sha-1");
  assert.match(
    h.staged[0]!.content,
    /^apps:\n {2}- studio\n {2}- data-connect\n {2}- explorer$/m,
  );
  assert.deepEqual(result.added, ["data-connect", "explorer"]);
  assert.deepEqual(result.alreadyListed, []);
});

test("a product already listed is reported and not duplicated", async () => {
  const h = harness({ [PATH]: { text: FILE, sha: "sha-1" } });
  const result = await joinExistingRecord(
    { path: PATH, label: "Dataset", apps: ["studio", "data-connect"] },
    h.deps,
  );
  assert.deepEqual(result.alreadyListed, ["studio"]);
  assert.deepEqual(result.added, ["data-connect"]);
  assert.equal(
    (h.staged[0]!.content.match(/- studio/g) ?? []).length,
    1,
    "studio must not be listed twice",
  );
});

test("nothing is staged when every product is already listed", async () => {
  const h = harness({ [PATH]: { text: FILE, sha: "sha-1" } });
  const result = await joinExistingRecord(
    { path: PATH, label: "Dataset", apps: ["studio"] },
    h.deps,
  );
  assert.equal(h.staged.length, 0, "a no-op edit must not enter the PR");
  assert.deepEqual(result.added, []);
  assert.equal(result.failed, false);
});

test("a record with no apps list to join is reported as failed", async () => {
  const h = harness({
    [PATH]: { text: "---\nslug: dataset\n---\nProse.\n", sha: "s" },
  });
  const result = await joinExistingRecord(
    { path: PATH, label: "Dataset", apps: ["data-connect"] },
    h.deps,
  );
  assert.equal(result.failed, true);
  assert.equal(h.staged.length, 0);
});

test("an unreadable record is reported as failed, never thrown", async () => {
  const h = harness();
  const result = await joinExistingRecord(
    { path: PATH, label: "Dataset", apps: ["data-connect"] },
    h.deps,
  );
  assert.equal(result.failed, true);
});

test("a staged edit in the batch wins over the remote as the base", async () => {
  const pending = FILE.replace("  - studio\n", "  - studio\n  - explorer\n");
  const h = harness(
    { [PATH]: { text: FILE, sha: "sha-1" } },
    { [PATH]: { content: pending, sha: "sha-1" } },
  );
  await joinExistingRecord(
    { path: PATH, label: "Dataset", apps: ["data-connect"] },
    h.deps,
  );
  assert.match(
    h.staged[0]!.content,
    /- studio\n {2}- explorer\n {2}- data-connect/,
  );
});
