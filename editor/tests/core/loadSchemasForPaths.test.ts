import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSchemasForPaths } from "../../src/core/validateAgainstSchema";

function fakeFetcher(byFile: Record<string, string>): {
  fetchText: (file: string) => Promise<string>;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchText = async (file: string): Promise<string> => {
    calls.push(file);
    if (!(file in byFile)) throw new Error(`unexpected fetch: ${file}`);
    return byFile[file]!;
  };
  return { fetchText, calls };
}

test("loads guideline-meta schema for a _meta.yml path", async () => {
  const { fetchText, calls } = fakeFetcher({
    "schemas/guideline-meta.json": JSON.stringify({ type: "object" }),
  });
  const schemas = await loadSchemasForPaths(
    ["components/src/breadcrumbs/_meta.yml"],
    fetchText,
  );
  assert.deepEqual(calls, ["schemas/guideline-meta.json"]);
  assert.deepEqual(schemas, { "guideline-meta": { type: "object" } });
});

test("dedups repeated keys — two _meta.yml fetch one schema", async () => {
  const { fetchText, calls } = fakeFetcher({
    "schemas/guideline-meta.json": JSON.stringify({ type: "object" }),
  });
  const schemas = await loadSchemasForPaths(
    ["components/src/a/_meta.yml", "components/src/b/_meta.yml"],
    fetchText,
  );
  assert.deepEqual(calls, ["schemas/guideline-meta.json"]);
  assert.ok("guideline-meta" in schemas);
});

test("maps app-context and icon-groups to their schema files", async () => {
  const { fetchText, calls } = fakeFetcher({
    "schemas/app-context.json": "{}",
    "schemas/icon-groups.json": "{}",
  });
  const schemas = await loadSchemasForPaths(
    ["app-context/dist/app-context.json", "components/src/icon-groups.json"],
    fetchText,
  );
  assert.deepEqual(
    new Set(calls),
    new Set(["schemas/app-context.json", "schemas/icon-groups.json"]),
  );
  assert.ok("app-context" in schemas);
  assert.ok("icon-groups" in schemas);
});

test("schema-less batch (markdown only) loads nothing", async () => {
  const { fetchText, calls } = fakeFetcher({});
  const schemas = await loadSchemasForPaths(
    ["foundations/src/color.md", "README.md"],
    fetchText,
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(schemas, {});
});
