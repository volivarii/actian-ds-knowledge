import { test } from "node:test";
import assert from "node:assert/strict";
import { bakedGraphIndex } from "../../src/substrate/graphIndex";
import { buildConnections } from "../../src/lib/connections/build";
import { pendingPreview, pendingCount } from "../../src/lib/connections/preview";
import { figmaUrl, loadFigmaUrls } from "../../src/lib/connections/figma";
import { fakeOctokit } from "../helpers/fakeOctokit";

test("preview lists removals then additions under each field", () => {
  const m = buildConnections({
    nodeId: "entity:catalog-object",
    index: bakedGraphIndex(),
    original: { "relationships.contains": ["metadata"], "relationships.uses": [] },
    live: { "relationships.contains": [], "relationships.uses": ["metadata"] },
  });
  assert.equal(pendingCount(m), 2);
  assert.deepEqual(
    pendingPreview(m).map((l) => `${l.kind}:${l.indent}:${l.text}`),
    [
      "field:1:relationships:",
      "field:2:contains:",
      "remove:3:- metadata",
      "field:2:uses:",
      "add:3:- metadata",
    ],
  );
});

test("ref fields preview as { ref: slug }", () => {
  const m = buildConnections({
    nodeId: "component:button",
    index: bakedGraphIndex(),
    original: { a11y_refs: ["buttons"] },
    live: { a11y_refs: ["buttons", "tooltips"] },
  });
  assert.deepEqual(
    pendingPreview(m).map((l) => l.text),
    ["a11y_refs:", "- { ref: tooltips }"],
  );
});

test("no pending changes, no preview", () => {
  const v = { a11y_refs: ["buttons"] };
  const m = buildConnections({ nodeId: "component:button", index: bakedGraphIndex(), original: v, live: v });
  assert.equal(pendingCount(m), 0);
  assert.deepEqual(pendingPreview(m), []);
});

test("figma deep link", () => {
  assert.equal(figmaUrl("ABC", "7764:7617"), "https://www.figma.com/design/ABC/?node-id=7764-7617");
});

test("Figma links load from the registry", async () => {
  const gh = fakeOctokit({
    "components/dist/registries/dskit.json": JSON.stringify({
      fileKey: "KEY",
      components: { button: { nodeId: "1:2" }, bare: {} },
    }),
  });
  const urls = await loadFigmaUrls(gh as never);
  assert.equal(urls.get("button"), "https://www.figma.com/design/KEY/?node-id=1-2");
  assert.equal(urls.has("bare"), false);
});
