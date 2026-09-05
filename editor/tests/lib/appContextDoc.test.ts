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

test("purpose, users and signals are declared on the shape that carries them", () => {
  // #647 read the frontmatter schema, saw that it omits purpose, users and
  // signals, and concluded three published fields had no contract. Measured,
  // the opposite is true, and acting on the issue would have made the schema
  // wrong: those three are not frontmatter at all. They are BODY sections
  // (## Purpose, ## Users, ## Signals) that derive-app-context.js lifts, and
  // schemas/app-context.json#/$defs/app declares all three with descriptions,
  // examples and required. `signals` is even documented there as what it is,
  // routing keywords, not the "behavioural signals" the frontmatter schema's
  // description used to promise.
  //
  // So this asserts the boundary rather than reporting a gap: each of the two
  // schemas declares the fields of the shape it describes, and neither borrows
  // the other's. app-context-app.json sets additionalProperties:false, so
  // declaring the three there would permit frontmatter keys the derive ignores
  // and the author can never legally write.
  const frontmatter = JSON.parse(
    readFileSync(join(REPO, "schemas", "app-context-app.json"), "utf8"),
  ) as { properties?: Record<string, unknown>; description?: string };
  const derived = JSON.parse(
    readFileSync(join(REPO, "schemas", "app-context.json"), "utf8"),
  ) as {
    $defs?: { app?: { properties?: Record<string, unknown>; required?: string[] } };
  };

  const fmKeys = Object.keys(frontmatter.properties ?? {});
  const appKeys = Object.keys(derived.$defs?.app?.properties ?? {});
  assert.ok(fmKeys.length > 0, "the frontmatter schema declares no properties");
  assert.ok(appKeys.length > 0, "the derived app schema declares no properties");

  const BODY_DERIVED = ["purpose", "users", "signals"];
  for (const field of BODY_DERIVED) {
    assert.ok(
      appKeys.includes(field),
      `${field} is lifted from the body and published, but schemas/app-context.json#/$defs/app does not declare it`,
    );
    assert.equal(
      fmKeys.includes(field),
      false,
      `${field} is a body section, so declaring it in schemas/app-context-app.json (additionalProperties:false) permits a frontmatter key that can never legally appear`,
    );
  }

  // And the description must not promise what the file does not describe. It
  // ended "and behavioural signals", which is wrong twice: signals are not in
  // this frontmatter, and they are routing keywords rather than behaviour.
  assert.equal(
    /behavioural signals/i.test(frontmatter.description ?? ""),
    false,
    "the frontmatter schema still promises signals it does not declare",
  );
});
