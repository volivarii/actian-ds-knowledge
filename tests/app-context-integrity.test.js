"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  validateAppContext,
} = require("../scripts/app-context/validate-app-context");
const { deriveToObject } = require("../scripts/app-context/derive-app-context");

test("a dangling relationship target is reported", () => {
  const bad = {
    apps: {},
    entities: { a: { relationships: { rel: "ghost" }, apps: [] } },
    patterns: {},
    terminology: {},
  };
  const { errors } = validateAppContext(bad);
  assert.ok(
    errors.some((e) => e.includes("ghost")),
    errors.join("\n"),
  );
});

test("the real derived dist has ZERO integrity errors (post-fix)", () => {
  const dist = deriveToObject(
    path.resolve(__dirname, "..", "app-context", "src"),
  );
  const { errors } = validateAppContext(dist);
  assert.deepEqual(
    errors,
    [],
    "fix dangling refs in app-context/src before this passes:\n" +
      errors.join("\n"),
  );
});

// The entity -> pattern join, which is how the domain model reaches the design
// system at all. Before it existed, all 30 app_entity nodes touched only each
// other and their apps, so nothing in the substrate said which components draw
// a Dataset. Both halves of the rule are asserted because the second one is the
// half a reviewer cannot eyeball: a pattern can exist and still run in a
// different app than the entity, which is an edge no screen can realise.
test("entities.patterns must exist and share an app with the entity", () => {
  const base = {
    apps: { studio: {}, administration: {} },
    entities: {},
    patterns: {
      "studio-only": { apps: ["studio"] },
    },
    terminology: {},
  };

  const dangling = JSON.parse(JSON.stringify(base));
  dangling.entities.thing = {
    relationships: {},
    apps: ["studio"],
    patterns: ["ghost-pattern"],
  };
  assert.ok(
    validateAppContext(dangling).errors.some((e) =>
      e.includes("ghost-pattern"),
    ),
    "a patterns[] entry naming no pattern must be reported",
  );

  const wrongApp = JSON.parse(JSON.stringify(base));
  wrongApp.entities.thing = {
    relationships: {},
    apps: ["administration"],
    patterns: ["studio-only"],
  };
  assert.ok(
    validateAppContext(wrongApp).errors.some((e) =>
      e.includes("shares no app"),
    ),
    "an administration entity joined to a studio-only pattern must be reported",
  );

  // The negative control. Without it both assertions above would still pass on
  // a validator that reported every join, and the real data below would be the
  // only thing standing between that and a green suite.
  const ok = JSON.parse(JSON.stringify(base));
  ok.entities.thing = {
    relationships: {},
    apps: ["studio", "administration"],
    patterns: ["studio-only"],
  };
  assert.deepEqual(
    validateAppContext(ok).errors,
    [],
    "an entity sharing one app with its pattern must NOT be reported",
  );
});

// Non-vacuity for the join, and it is deliberately about REACH rather than a
// count of edges: the point of the join is that a consumer can get from a domain
// entity to the components that draw it, and that traversal runs
// entities.patterns -> patterns.components. An edge count can stay healthy while
// every entity points at patterns that carry no components.
//
// 🪤 The first version of this asserted that EVERY entity reaches a component,
// and that was a gate which manufactured the defect it was meant to prevent. The
// schema says patterns[] is optional and absent when no pattern shows the entity,
// so "every entity" is unsatisfiable without inventing an edge for the entities
// no pattern shows. It did exactly that: under it, seven entities that are not
// catalog objects (contact, metadata, an input-port) were joined to
// asset-detail-360, whose own `when` clause reads "Use for one catalog object".
// A reviewer caught it; the gate had been green throughout. So the assertion is
// now conditional on an entity HAVING a join, which is the thing actually worth
// protecting, plus a floor so the file cannot pass while the join is empty.
test("an entity that names patterns reaches a component through them", () => {
  const dist = deriveToObject(
    path.resolve(__dirname, "..", "app-context", "src"),
  );
  const entities = dist.entities || {};
  const patterns = dist.patterns || {};
  assert.ok(
    Object.keys(entities).length > 0,
    "no entities derived, so this proves nothing",
  );

  const joined = Object.keys(entities).filter(
    (slug) => (entities[slug].patterns || []).length > 0,
  );
  assert.ok(
    joined.length > 0,
    "no entity names a single pattern, so the domain model reaches no part of " +
      "the design system and the traversal below has no subject",
  );

  const stranded = joined.filter(
    (slug) =>
      !(entities[slug].patterns || []).some(
        (p) => ((patterns[p] || {}).components || []).length > 0,
      ),
  );
  assert.deepEqual(
    stranded,
    [],
    "these entities name patterns but reach no component through any of them, " +
      "so their join buys nothing: " + JSON.stringify(stranded),
  );
});

test("useCases.patterns must exist and be scoped to the app", () => {
  // `explorer` is declared so the pre-existing pattern.apps integrity check
  // doesn't fire on p-explorer; this isolates the useCases checks under test.
  const base = {
    apps: {
      studio: {
        useCases: [{ audience: ["s"], jobs: ["j"], patterns: ["p-studio"] }],
      },
      explorer: { useCases: [] },
    },
    entities: {},
    patterns: {
      "p-studio": { apps: ["studio"] },
      "p-explorer": { apps: ["explorer"] },
    },
    // The audience "s" names a persona that works in studio, so the persona
    // join stays quiet and only the pattern checks speak.
    personas: { s: { label: "s", apps: ["studio"] } },
  };
  assert.deepEqual(validateAppContext(base).errors, []);

  const unknown = {
    ...base,
    apps: {
      ...base.apps,
      studio: {
        useCases: [{ audience: ["s"], jobs: ["j"], patterns: ["nope"] }],
      },
    },
  };
  assert.equal(validateAppContext(unknown).errors.length, 1);

  const cross = {
    ...base,
    apps: {
      ...base.apps,
      studio: {
        useCases: [{ audience: ["s"], jobs: ["j"], patterns: ["p-explorer"] }],
      },
    },
  };
  assert.match(validateAppContext(cross).errors[0], /not scoped to app/);
});

// The persona join. An audience is a persona's label, so a label no persona
// carries is a word the substrate cannot resolve, and a persona that exists but
// does not work in the app is a use case no screen can realise for it. Both
// halves plus a negative control, the same shape as the entity/pattern join.
test("a use case audience must name a persona that works in that app", () => {
  const base = () => ({
    apps: {
      studio: { useCases: [{ audience: ["Data steward"], jobs: ["Govern"] }] },
      explorer: {},
    },
    entities: {},
    patterns: {},
    terminology: {},
    personas: {},
  });

  const unknownErrors = validateAppContext(base()).errors;
  assert.ok(
    unknownErrors.includes(
      'app "studio".useCases → audience "Data steward" is not a persona',
    ),
    unknownErrors.join("\n"),
  );

  const wrongApp = base();
  wrongApp.personas["data-steward"] = {
    label: "Data steward",
    apps: ["explorer"],
  };
  const wrongAppErrors = validateAppContext(wrongApp).errors;
  assert.ok(
    wrongAppErrors.includes(
      'app "studio".useCases → audience "Data steward" is not scoped to app "studio"',
    ),
    wrongAppErrors.join("\n"),
  );

  const ok = base();
  ok.personas["data-steward"] = { label: "Data steward", apps: ["studio"] };
  assert.deepEqual(
    validateAppContext(ok).errors,
    [],
    "a persona that works in the app must NOT be reported",
  );
});

test("a persona lists only apps that exist, and no two personas share a label", () => {
  const dist = {
    apps: { studio: {} },
    entities: {},
    patterns: {},
    terminology: {},
    personas: {
      "data-steward": { label: "Data steward", apps: ["studio", "ghost-app"] },
      steward: { label: "Data steward", apps: ["studio"] },
    },
  };
  const { errors } = validateAppContext(dist);
  assert.ok(
    errors.includes('persona "data-steward".apps → "ghost-app" is not an app'),
    errors.join("\n"),
  );
  assert.ok(
    errors.includes(
      'persona label "Data steward" is used by more than one persona (data-steward, steward)',
    ),
    errors.join("\n"),
  );
});
