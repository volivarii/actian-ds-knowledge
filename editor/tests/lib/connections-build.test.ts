import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { bakedGraphIndex } from "../../src/substrate/graphIndex";
import { buildConnections, countConnections } from "../../src/lib/connections/build";
import { ownedValues } from "../../src/lib/connections/owned";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const fm = (text: string) => parseYaml(text.match(/^---\n([\s\S]*?)\n---/)![1]!) as Record<string, unknown>;
const body = (text: string) => text.replace(/^---\n[\s\S]*?\n---\n?/, "");
const index = bakedGraphIndex();
const byKey = (m: ReturnType<typeof buildConnections>, k: string) => m.groups.find((g) => g.key === k);

test("Button: 67 connections in 7 groups, with the two links the graph does not know", () => {
  const meta = parseYaml(read("components/src/button/_meta.yml"));
  const values = ownedValues("component", meta);
  const bodies = ["usage.md", "content.md", "behavior.md", "design.md"].map((f) => ({
    path: `components/src/button/${f}`,
    text: read(`components/src/button/${f}`),
  }));
  const m = buildConnections({ nodeId: "component:button", index, original: values, live: values, bodies });
  assert.equal(countConnections(m), 67);
  assert.deepEqual(
    m.groups.map((g) => g.key),
    ["part-of", "built-from", "must-follow", "must-follow-via", "mentioned", "nested-in", "used-in-patterns"],
  );
  assert.equal(byKey(m, "part-of")!.store, "figma");
  assert.equal(byKey(m, "must-follow")!.editable, true);
  assert.equal(byKey(m, "must-follow-via")!.label, "Must follow, via Action");
  assert.equal(byKey(m, "must-follow-via")!.items.length, 7);
  const missing = byKey(m, "mentioned")!
    .items.filter((i) => i.state === "notInGraph")
    .map((i) => i.slug);
  assert.deepEqual(missing.sort(), ["dropdown-select", "tooltip"]);
  assert.equal(byKey(m, "nested-in")!.items.length, 31);
  assert.equal(byKey(m, "used-in-patterns")!.items.length, 14);
  assert.equal(byKey(m, "must-follow")!.phrase, "Button must follow {other}.");
});

test("360 pattern: 25 counted, two code-style mentions not counted", () => {
  const text = read("app-context/src/patterns/asset-detail-360.md");
  const v = ownedValues("pattern", fm(text));
  const m = buildConnections({
    nodeId: "pattern:asset-detail-360",
    index,
    original: v,
    live: v,
    bodies: [{ path: "app-context/src/patterns/asset-detail-360.md", text: body(text) }],
  });
  assert.equal(countConnections(m), 25);
  assert.equal(byKey(m, "built-from")!.items.length, 16);
  assert.deepEqual(
    byKey(m, "named")!.items.map((i) => [i.slug, i.unlinked]),
    [
      ["faceted-browse", true],
      ["search-filtered-table", true],
    ],
  );
  assert.equal(byKey(m, "shows")!.store, "other");
});

test("Catalog Object: two-way links collapse, Topic stays incoming", () => {
  const v = ownedValues("entity", fm(read("app-context/src/entities/catalog-object.md")));
  const m = buildConnections({ nodeId: "entity:catalog-object", index, original: v, live: v });
  assert.equal(countConnections(m), 18);
  const domain = byKey(m, "rel:belongsTo")!.items[0]!;
  assert.equal(domain.reciprocal, "Domain says it contains Catalog Object.");
  assert.deepEqual(
    byKey(m, "in:contains")!.items.map((i) => i.title),
    ["Topic"],
  );
  assert.equal(byKey(m, "in:contains")!.label, "Contained by");
  assert.equal(byKey(m, "glossary-term")!.store, "inferred");
  assert.equal(m.connect.filter((c) => c.groupKey.startsWith("rel:")).length, 10);
});

test("pending states come from original vs live, never from the graph", () => {
  const v = ownedValues("pattern", fm(read("app-context/src/patterns/asset-detail-360.md")));
  const live = { ...v, components: [...v.components!.filter((s) => s !== "tabs"), "dropdown-select"] };
  const m = buildConnections({ nodeId: "pattern:asset-detail-360", index, original: v, live });
  const items = byKey(m, "built-from")!.items;
  assert.equal(items.find((i) => i.slug === "tabs")!.state, "removed");
  assert.equal(items.find((i) => i.slug === "dropdown-select")!.state, "added");
  assert.equal(countConnections(m), 25, "16 components (one removed, one added), 2 products, 7 entities");
});

test("an authored slug that is not a graph node is notInGraph, not pending", () => {
  const v = { apps: ["studio"], components: ["dropdown-select"] };
  const m = buildConnections({ nodeId: "pattern:asset-detail-360", index, original: v, live: v });
  const i = byKey(m, "built-from")!.items[0]!;
  assert.equal(i.state, "notInGraph");
  assert.equal(i.title, "dropdown-select");
});

test("a new record not in the graph yet: everything is added, name falls back", () => {
  const m = buildConnections({
    nodeId: "pattern:brand-new",
    index,
    name: "Brand new",
    original: {},
    live: { apps: ["studio"] },
  });
  assert.equal(m.name, "Brand new");
  assert.equal(byKey(m, "part-of")!.items[0]!.state, "added");
});

test("read-only surfaces: no original and live means owned groups come from the graph, not editable", () => {
  const m = buildConnections({ nodeId: "component:button", index });
  assert.equal(byKey(m, "must-follow")!.editable, false);
  assert.equal(byKey(m, "must-follow")!.items.length, 1);
});

test("two entities linked twice show both relations: data-process consumes and produces Dataset", () => {
  const text = read("app-context/src/entities/dataset.md");
  const v = ownedValues("entity", fm(text));
  const m = buildConnections({ nodeId: "entity:dataset", index, original: v, live: v });
  const labels = (slug: string) =>
    m.groups.filter((g) => g.items.some((i) => i.slug === slug)).map((g) => g.label);
  assert.deepEqual(labels("data-process").sort(), ["Consumed by", "Produced by"]);
  const ro = buildConnections({ nodeId: "entity:data-process", index });
  const out = (slug: string) => ro.groups.filter((g) => g.items.some((i) => i.slug === slug)).map((g) => g.label);
  assert.deepEqual(out("dataset").sort(), ["Consumes", "Produces"]);
});
