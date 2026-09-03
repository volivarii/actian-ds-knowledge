// The doc type must describe the file, not a subset of it. `entities` and
// `terminology` were carried by app-context.json from the day it shipped and
// declared by nothing, so no consumer could reach them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { AppContextDoc } from "../../src/lib/patternIndex";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function realDoc(): AppContextDoc {
  return JSON.parse(
    readFileSync(join(REPO, "app-context", "dist", "app-context.json"), "utf8"),
  ) as AppContextDoc;
}

test("the declared shape reaches every collection the file carries", () => {
  const doc = realDoc();
  // Assert the JOIN: each key is declared AND non-empty in the real file. A
  // type that compiles against an empty object proves nothing.
  assert.ok(Object.keys(doc.apps ?? {}).length > 0, "no apps");
  assert.ok(Object.keys(doc.patterns ?? {}).length > 0, "no patterns");
  assert.ok(Object.keys(doc.entities ?? {}).length > 0, "no entities");
  assert.ok(Object.keys(doc.terminology ?? {}).length > 0, "no terminology");
});

test("an entity carries the three fields its Slots read", () => {
  const doc = realDoc();
  const e = doc.entities?.["access-request"];
  assert.ok(e, "access-request is missing from the corpus");
  assert.ok(Array.isArray(e.properties) && e.properties.length > 0);
  assert.ok(e.relationships && Object.keys(e.relationships).length > 0);
  assert.ok(Array.isArray(e.apps) && e.apps.length > 0);
});

test("a term carries meaning and notUse", () => {
  const doc = realDoc();
  const t = doc.terminology?.["studio"];
  assert.ok(t, "studio is missing from terminology");
  assert.equal(typeof t.meaning, "string");
  assert.ok(Array.isArray(t.notUse));
});

test("an app carries the three fields AppRecord did not declare", () => {
  const doc = realDoc();
  const a = doc.apps?.["studio"];
  assert.ok(a, "studio is missing from the corpus");
  // `signals` is a LIST of routing keywords ("steward", "govern", "curate"),
  // not prose about feedback. The design doc read the field name as
  // "behavioural signals" and described it as how a product tells a user
  // something happened; the corpus says otherwise, and a Slot's help text is
  // read by an author, so the shape decides the wording rather than the name.
  assert.ok(Array.isArray(a.signals) && a.signals.length > 0, "signals is not a non-empty list");
  assert.equal(typeof a.signals[0], "string");
  assert.ok(Array.isArray(a.users) && a.users.length > 0);
  assert.equal(typeof a.purpose, "string");
});

test("the app schema does not declare three fields every app file carries", () => {
  // Not this plan's to fix, but asserted so it cannot be forgotten: the
  // schema's `properties` omits purpose, users and signals while all three are
  // authored in every app and carried through the derive. Same family as the
  // doc-type gap above. If a later change adds them, this test fails and gets
  // deleted, which is the correct outcome.
  const schema = JSON.parse(
    readFileSync(join(REPO, "schemas", "app-context-app.json"), "utf8"),
  ) as { properties?: Record<string, unknown> };
  const declared = Object.keys(schema.properties ?? {});
  assert.ok(declared.length > 0, "schema declares no properties — vacuous");
  for (const field of ["purpose", "users", "signals"]) {
    assert.ok(
      !declared.includes(field),
      `schema now declares ${field} — good; delete this test and see #NNN`,
    );
  }
});
