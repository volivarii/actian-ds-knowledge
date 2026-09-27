import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupDef,
  storeFor,
  STORE_LABEL,
  VERBS,
  VERB_LABEL,
  verbPhrase,
  fillName,
  fillOther,
  GROUP_ORDER,
} from "../../src/lib/connections/vocabulary";
import { graphEdges } from "../../src/substrate/taxonomyAssets";

test("every edge type in the real graph has a group in both directions", () => {
  const types = new Set(graphEdges.map((e) => e.type));
  assert.ok(types.size >= 10, `only ${types.size} edge types, vacuous`);
  const missing: string[] = [];
  for (const t of types) {
    for (const dir of ["out", "in"] as const) {
      const pred = t === "entity_related" ? "contains" : undefined;
      if (!groupDef(t, dir, pred)) missing.push(`${t}:${dir}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("every group key a definition can produce has a place in GROUP_ORDER", () => {
  const types = new Set(graphEdges.map((e) => e.type));
  const keys = new Set<string>();
  for (const t of types)
    for (const dir of ["out", "in"] as const) {
      const preds: Array<string | undefined> = t === "entity_related" ? [...VERBS] : [undefined];
      for (const v of preds) keys.add(groupDef(t, dir, v)!.key.replace(/:.*$/, ":*"));
    }
  const unordered = [...keys].filter((k) => !GROUP_ORDER.includes(k));
  assert.deepEqual(unordered, []);
});

test("the store follows who writes the link", () => {
  assert.equal(storeFor("composed_of", "out"), "figma");
  assert.equal(storeFor("in_category", "in"), "figma");
  assert.equal(storeFor("narrower", "out"), "structure");
  assert.equal(storeFor("term_about", "in"), "inferred");
  assert.equal(storeFor("uses_component", "out"), "here");
  assert.equal(storeFor("uses_component", "in"), "other");
  assert.equal(storeFor("entity_related", "in"), "other");
});

test("labels, sentences and phrases are plain words", () => {
  assert.equal(groupDef("composed_of", "in")!.label, "Nested in");
  assert.equal(groupDef("uses_component", "in")!.label, "Used in patterns");
  assert.equal(groupDef("entity_related", "out", "belongsTo")!.label, "Belongs to");
  assert.equal(groupDef("entity_related", "in", "contains")!.label, "Contained by");
  assert.equal(
    fillName(groupDef("composed_of", "out")!.sentence, "Button"),
    "Components nested inside Button in Figma.",
  );
  assert.equal(
    fillOther(fillName(groupDef("composed_of", "in")!.phrase, "Button"), "Header"),
    "Header contains Button in Figma.",
  );
  assert.equal(
    fillOther(fillName(groupDef("entity_related", "out", "relatesTo")!.phrase, "Catalog Object"), "Glossary Item"),
    "Catalog Object is related to Glossary Item.",
  );
  assert.equal(STORE_LABEL.here, "Editable here");
  assert.equal(verbPhrase("relatesTo"), "is related to");
  for (const v of VERBS) assert.ok(VERB_LABEL[v], v);
});

test("every entity verb in the real graph is known", () => {
  const verbs = new Set(graphEdges.filter((e) => e.type === "entity_related").map((e) => e.predicate));
  assert.ok(verbs.size > 0, "no entity_related predicates, vacuous");
  const unknown = [...verbs].filter((v) => !(VERBS as readonly string[]).includes(v as string));
  assert.deepEqual(unknown, []);
});
