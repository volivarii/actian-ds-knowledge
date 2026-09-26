import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  OWNED,
  recordKindOf,
  ownedValues,
  applyConnectionEdit,
  restoreOwned,
  nodeIdFor,
} from "../../src/lib/connections/owned";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fm = (rel: string) => {
  const t = readFileSync(join(REPO, rel), "utf8");
  const m = t.match(/^---\n([\s\S]*?)\n---/);
  return parseYaml(m ? m[1]! : t) as Record<string, unknown>;
};

test("record kinds come from the node id prefix", () => {
  assert.equal(recordKindOf("component:button"), "component");
  assert.equal(recordKindOf("pattern:asset-detail-360"), "pattern");
  assert.equal(recordKindOf("a11y:buttons"), "a11y");
  assert.equal(recordKindOf("nope"), null);
  assert.equal(nodeIdFor("a11y_criterion", "buttons"), "a11y:buttons");
  assert.equal(nodeIdFor("ux_pattern", "faceted-browse"), "pattern:faceted-browse");
});

test("owned values are read from real files", () => {
  const e = ownedValues("entity", fm("app-context/src/entities/catalog-object.md"));
  assert.deepEqual(e["apps"], ["studio", "explorer"]);
  assert.deepEqual(e["relationships.belongsTo"], ["domain"]);
  assert.equal(e["relationships.contains"]!.length, 5);
  const c = ownedValues("component", fm("components/src/button/_meta.yml"));
  assert.deepEqual(c["a11y_refs"], ["buttons"]);
});

test("duplicates are read once", () => {
  const raw = fm("app-context/src/patterns/access-request-management.md");
  const listed = raw.components as string[];
  assert.ok(listed.length > new Set(listed).size, "fixture no longer has duplicates, vacuous");
  const comps = ownedValues("pattern", raw)["components"]!;
  assert.equal(comps.length, new Set(comps).size);
});

test("add writes the right shape and is a no-op when present", () => {
  const d0 = { a11y_refs: [{ ref: "buttons" }] };
  const d1 = applyConnectionEdit(d0, { op: "add", field: ["a11y_refs"], slug: "tooltips", shape: "ref" });
  assert.deepEqual(d1.a11y_refs, [{ ref: "buttons" }, { ref: "tooltips" }]);
  assert.deepEqual(d0.a11y_refs, [{ ref: "buttons" }], "input untouched");
  const d2 = applyConnectionEdit(d1, { op: "add", field: ["a11y_refs"], slug: "buttons", shape: "ref" });
  assert.deepEqual(d2, d1);
});

test("add creates missing containers, remove removes every copy", () => {
  const d1 = applyConnectionEdit({}, { op: "add", field: ["relationships", "uses"], slug: "connection", shape: "slug" });
  assert.deepEqual(d1, { relationships: { uses: ["connection"] } });
  const d2 = applyConnectionEdit(
    { components: ["table", "button", "table"] },
    { op: "remove", field: ["components"], slug: "table", shape: "slug" },
  );
  assert.deepEqual(d2.components, ["button"]);
});

test("an emptied verb is deleted, an emptied top-level list stays", () => {
  const d1 = applyConnectionEdit(
    { relationships: { uses: ["x"], contains: ["y"] } },
    { op: "remove", field: ["relationships", "uses"], slug: "x", shape: "slug" },
  );
  assert.deepEqual(d1, { relationships: { contains: ["y"] } });
  const d2 = applyConnectionEdit({ apps: ["studio"] }, { op: "remove", field: ["apps"], slug: "studio", shape: "slug" });
  assert.deepEqual(d2, { apps: [] });
  const d3 = applyConnectionEdit(
    { label: "A", relationships: { uses: ["x"] } },
    { op: "remove", field: ["relationships", "uses"], slug: "x", shape: "slug" },
  );
  assert.deepEqual(d3, { label: "A" }, "an emptied relationships block goes too");
});

test("restoreOwned puts back only the owned fields", () => {
  const original = { label: "A", apps: ["studio"], components: ["tabs"] };
  const current = { label: "B", apps: ["studio", "explorer"], components: [] };
  assert.deepEqual(restoreOwned("pattern", current, original), { label: "B", apps: ["studio"], components: ["tabs"] });
});

test("for every real record, remove then add of an owned value restores the same values", () => {
  const dirs: Array<[string, "pattern" | "entity" | "persona"]> = [
    ["app-context/src/patterns", "pattern"],
    ["app-context/src/entities", "entity"],
    ["app-context/src/personas", "persona"],
  ];
  let checked = 0;
  for (const [dir, kind] of dirs) {
    for (const f of readdirSync(join(REPO, dir)).filter((x) => x.endsWith(".md"))) {
      const data = fm(`${dir}/${f}`);
      const before = ownedValues(kind, data);
      for (const of of OWNED[kind]!) {
        const key = of.field.join(".");
        const first = before[key]?.[0];
        if (!first) continue;
        const removed = applyConnectionEdit(data, { op: "remove", field: of.field, slug: first, shape: of.shape });
        const back = applyConnectionEdit(removed, { op: "add", field: of.field, slug: first, shape: of.shape });
        assert.deepEqual(new Set(ownedValues(kind, back)[key]), new Set(before[key]), `${f} ${key}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 60, `checked ${checked}`);
});
