import test from "node:test";
import assert from "node:assert/strict";
import { appContextAppUiSchema } from "../../src/uiSchemas/appContextApp";
import { appContextEntityUiSchema } from "../../src/uiSchemas/appContextEntity";
import { appContextPatternUiSchema } from "../../src/uiSchemas/appContextPattern";

test("slug and _schema_version are read-only in every app-context uiSchema", () => {
  for (const ui of [appContextAppUiSchema, appContextEntityUiSchema, appContextPatternUiSchema]) {
    assert.equal((ui.slug as any)["ui:readonly"], true);
    assert.equal((ui._schema_version as any)["ui:readonly"], true);
    const order = ui["ui:order"] as string[];
    assert.equal(order[order.length - 1], "*");
  }
});

test("entity/pattern uiSchemas do not list description (it is the prose body)", () => {
  assert.ok(!("description" in appContextEntityUiSchema) ||
    (appContextEntityUiSchema["ui:order"] as string[]).indexOf("description") === -1);
  assert.ok((appContextPatternUiSchema["ui:order"] as string[]).indexOf("description") === -1);
});

// The generalisable half of #646. The rendering tests in
// tests/app/nomenclatureRenders.tsx prove a screen shows the author's words;
// this proves NO author-facing field was left without them, which is how
// `when` reached the form captioned with its own lowercase YAML key while
// every other field had a title. The subject is read from the SCHEMA, so a
// field added to the contract tomorrow is enrolled without anyone listing it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

type Node = {
  properties?: Record<string, Node>;
  items?: Node;
  description?: string;
};

/** Every field path an author fills, including the ones nested inside an object
 *  or an array's items.
 *
 *  Nesting matters: `useCases[].patterns` on the app form was captioned with
 *  its raw key and described with "enforced by validate-app-context.js", a
 *  script name reaching an author, one level below where the first version of
 *  this guard looked. `header.type` was captioned `type` for the same reason. */
function schemaPaths(file: string): string[] {
  const root = JSON.parse(
    readFileSync(resolve(REPO, "schemas", file), "utf8"),
  ) as Node;
  const out: string[] = [];
  const walk = (node: Node, path: string) => {
    for (const [k, v] of Object.entries(node.properties ?? {})) {
      const p = path ? `${path}.${k}` : k;
      out.push(p);
      if (v.properties) walk(v, p);
      if (v.items?.properties) walk(v.items, `${p}.items`);
    }
  };
  walk(root, "");
  return out;
}

/** The uiSchema entry at a dotted path, or undefined. */
function uiAt(
  ui: Record<string, unknown>,
  path: string,
): Record<string, unknown> | undefined {
  let here: Record<string, unknown> | undefined = ui;
  for (const seg of path.split(".")) {
    if (!here) return undefined;
    here = here[seg] as Record<string, unknown> | undefined;
  }
  return here;
}

/** Fields an author can edit.
 *
 *  Keyed on `ui:readonly`, not on group membership. The first version excluded
 *  every field in a collapsed group, which silently exempted the app form's
 *  `header` and `sidebar`: that group is "Product settings", collapsed but
 *  editable, so two fields an author opens and fills were being skipped by a
 *  guard whose subject is supposed to be "what an author reads". Readonly is
 *  the thing that actually says "not yours to edit".
 *
 *  `description` is excluded because it is the markdown body, not a field. */
function authorFacing(ui: Record<string, unknown>, paths: string[]): string[] {
  return paths.filter((p) => {
    if (p.split(".").pop() === "description") return false;
    const e = uiAt(ui, p);
    return !(e && e["ui:readonly"] === true);
  });
}

for (const [name, ui, file] of [
  ["pattern", appContextPatternUiSchema, "app-context-pattern.json"],
  ["entity", appContextEntityUiSchema, "app-context-entity.json"],
  ["app", appContextAppUiSchema, "app-context-app.json"],
] as const) {
  test(`every author-facing ${name} field carries a human title`, () => {
    const fields = authorFacing(
      ui as unknown as Record<string, unknown>,
      schemaPaths(file),
    );
    assert.ok(fields.length > 0, `${name}: no author-facing fields found`);
    const untitled = fields.filter((f) => {
      const e = uiAt(ui as unknown as Record<string, unknown>, f);
      if (!e) return true;
      // `ui:field` replaces the whole field with a component of ours, and that
      // component draws its own heading (RelationshipsField renders
      // "Relationships"). Requiring ui:title there would demand a caption RJSF
      // never renders. Verified by reading the component, not assumed.
      if (typeof e["ui:field"] === "string") return false;
      return typeof e["ui:title"] !== "string";
    });
    // Reported together rather than one assert per field: the first version
    // stopped at `useCases` and said nothing about what came after it.
    assert.deepEqual(
      untitled,
      [],
      `${name}: these fields have no ui:title, so the form captions them with the raw key: ${untitled.join(", ")}`,
    );
  });
}
