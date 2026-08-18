"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../scripts/sync/deferred-removals.js");

// A registry pair where one component is about to be removed.
function fixture() {
  const entry = { name: "Card for items", key: "abc123", nodeId: "7613:7853" };
  return {
    before: {
      components: {
        "card-for-items": entry,
        button: { name: "Button", key: "b1" },
      },
    },
    after: { components: { button: { name: "Button", key: "b1" } } },
  };
}

const LIVE = {
  kit: "dsKit",
  slug: "card-for-items",
  key: "abc123",
  reason: "Figma refactor incomplete",
  issue: 526,
  review_by: "2026-09-18",
};

test("a live deferral carries the entry forward, so there is no removal left to classify", () => {
  const { before, after } = fixture();
  const r = D.resolve({
    deferrals: [LIVE],
    kitId: "dsKit",
    before,
    after,
    now: "2026-08-18T07:00:00.000Z",
  });
  assert.deepEqual(r.errors, [], "no errors expected");
  assert.equal(r.apply.length, 1);

  const next = D.reinstate(before, after, r.apply);
  assert.ok(next.components["card-for-items"], "entry must be carried forward");
  assert.equal(next.components["card-for-items"].deferral.issue, 526);
  assert.equal(
    next.components["card-for-items"].name,
    "Card for items",
    "carried verbatim",
  );
  assert.ok(next.components.button, "untouched entries survive");
});

test("a deferral past review_by does NOT apply, and says how far past it is", () => {
  const { before, after } = fixture();
  const r = D.resolve({
    deferrals: [LIVE],
    kitId: "dsKit",
    before,
    after,
    now: "2026-09-25T07:00:00.000Z", // 7 days after review_by
  });
  assert.equal(
    r.apply.length,
    0,
    "an expired deferral must not carry the entry forward",
  );
  assert.equal(r.expired.length, 1);
  assert.equal(r.expired[0].slug, "card-for-items");
  assert.equal(r.expired[0].daysPast, 7);

  // and the entry really is gone, so the removal returns and the verdict re-breaks
  const next = D.reinstate(before, after, r.apply);
  assert.equal(next.components["card-for-items"], undefined);
});

test("review_by is inclusive: the deferral still applies ON its review date", () => {
  const { before, after } = fixture();
  const r = D.resolve({
    deferrals: [LIVE],
    kitId: "dsKit",
    before,
    after,
    now: "2026-09-18T23:59:00.000Z",
  });
  assert.equal(
    r.apply.length,
    1,
    "expiry is at the END of review_by, not the start",
  );
  assert.equal(r.expired.length, 0);
});

test("a deferral for a slug that is NOT being removed is an error, not a silent no-op", () => {
  const { before, after } = fixture();
  // `button` is not being removed, so this deferral has no subject.
  const stale = Object.assign({}, LIVE, { slug: "button", key: "b1" });
  const r = D.resolve({
    deferrals: [stale],
    kitId: "dsKit",
    before,
    after,
    now: "2026-08-18T07:00:00.000Z",
  });
  assert.equal(r.apply.length, 0);
  assert.equal(r.errors.length, 1, "dead config must be reported");
  assert.match(r.errors[0], /button/);
  assert.match(r.errors[0], /not being removed|no removal/i);
});

test("a deferral whose key does not match the entry is an error, so a reused slug cannot resurrect the wrong component", () => {
  const { before, after } = fixture();
  const wrongKey = Object.assign({}, LIVE, { key: "SOMETHING-ELSE" });
  const r = D.resolve({
    deferrals: [wrongKey],
    kitId: "dsKit",
    before,
    after,
    now: "2026-08-18T07:00:00.000Z",
  });
  assert.equal(
    r.apply.length,
    0,
    "must not carry forward on an identity mismatch",
  );
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /key/i);
});

test("a deferral missing a reason, an issue or a review_by is an error", () => {
  const { before, after } = fixture();
  const cases = [
    [{ reason: undefined }, /reason/i],
    [{ issue: undefined }, /issue/i],
    [{ review_by: undefined }, /review_by/i],
    [{ review_by: "next month" }, /review_by/i],
  ];
  for (const [patch, re] of cases) {
    const d = Object.assign({}, LIVE, patch);
    const r = D.resolve({
      deferrals: [d],
      kitId: "dsKit",
      before,
      after,
      now: "2026-08-18T07:00:00.000Z",
    });
    assert.equal(r.apply.length, 0, JSON.stringify(patch) + " must not apply");
    assert.equal(r.errors.length, 1, JSON.stringify(patch) + " must error");
    assert.match(r.errors[0], re);
  }
});

test("a deferral for another kit is ignored, so a DS deferral cannot cover an FM removal", () => {
  const { before, after } = fixture();
  const r = D.resolve({
    deferrals: [Object.assign({}, LIVE, { kit: "fmKit" })],
    kitId: "dsKit",
    before,
    after,
    now: "2026-08-18T07:00:00.000Z",
  });
  assert.deepEqual(r.apply, []);
  assert.deepEqual(
    r.errors,
    [],
    "another kit's deferral is not this kit's dead config",
  );
});

// The registry's componentEntry is additionalProperties:false, so a marked
// entry is only publishable if the schema knows the field. Asserted here rather
// than discovered on the first night somebody actually defers something.
// Compiles the WHOLE schema, because componentEntry $refs its siblings.
test("schemas/registry.json accepts an entry marked as a deferred removal", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const Ajv = require("ajv/dist/2020");
  const schema = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "schemas", "registry.json"),
      "utf8",
    ),
  );
  const validate = new Ajv({ strict: false, allowUnionTypes: true }).compile(
    schema,
  );
  const entry = {
    name: "Card for items",
    key: "K-CARD",
    nodeId: "10:1",
    importMethod: "set",
    description: "",
    page: "Card",
    properties: {},
    nestedComponents: [],
    documentationLinks: [],
  };
  const doc = (extra) => ({
    library: "ds",
    fileKey: "DS_KEY",
    lastSynced: "2026-08-18T07:00:00.000Z",
    components: { "card-for-items": Object.assign({}, entry, extra) },
  });

  // control: the entry without the marker is valid, so a failure below is
  // about the new field and not about the fixture.
  assert.ok(validate(doc()), "control: " + JSON.stringify(validate.errors));

  assert.ok(
    validate(
      doc({
        deferral: {
          reason: "Figma refactor incomplete",
          issue: 526,
          review_by: "2026-09-18",
        },
      }),
    ),
    JSON.stringify(validate.errors),
  );

  // and the shape is constrained: a deferral without an expiry is not valid
  assert.equal(
    validate(doc({ deferral: { reason: "x", issue: 1 } })),
    false,
    "review_by must be required by the schema, not only by the loader",
  );
});

test("a deferral does not clobber a Figma-sourced status", () => {
  const before = {
    components: {
      "card-for-items": {
        name: "Card for items",
        key: "abc123",
        status: "in-progress",
      },
    },
  };
  const after = { components: {} };
  const r = D.resolve({
    deferrals: [LIVE],
    kitId: "dsKit",
    before,
    after,
    now: "2026-08-18T07:00:00.000Z",
  });
  const next = D.reinstate(before, after, r.apply);
  assert.equal(
    next.components["card-for-items"].status,
    "in-progress",
    "what Figma says about the component must survive being deferred",
  );
  assert.ok(
    next.components["card-for-items"].deferral,
    "and the deferral is its own field",
  );
});

// The CHANGELOG claims the carried entry is "byte-stable across nights". A
// deferral that re-serialised differently each night would make the sync write
// and bump every night for no content change, which is the churn the
// canonical-write gate exists to stop.
//
// Asserted on the SHAPE, not on serialised equality. A first attempt compared
// JSON.stringify across two runs and could not catch a per-run timestamp,
// because two toISOString() calls in the same millisecond are equal. The test
// passed for a reason that had nothing to do with the property.
test("a carried entry gains exactly one field, so it cannot churn nightly", () => {
  const original = {
    name: "Card for items",
    key: "abc123",
    nodeId: "7613:7853",
  };
  const button = { name: "Button", key: "b1" };
  const figma = { components: { button } };
  const committed = { components: { "card-for-items": original, button } };

  const carry = (before) =>
    D.reinstate(
      before,
      figma,
      D.resolve({
        deferrals: [LIVE],
        kitId: "dsKit",
        before,
        after: figma,
        now: "2026-08-18T07:00:00.000Z",
      }).apply,
    );

  const night1 = carry(committed);
  const entry1 = night1.components["card-for-items"];
  assert.deepEqual(
    Object.keys(entry1).sort(),
    Object.keys(original).concat("deferral").sort(),
    "exactly the original fields plus `deferral`; anything else is a per-run value",
  );

  // night 2 reads night 1's output as its committed registry
  const night2 = carry(night1);
  assert.deepEqual(
    night2.components["card-for-items"],
    entry1,
    "a second night must reproduce the first exactly",
  );
});

test("a deferral cannot cover a RENAME, even though the old slug does leave `after`", () => {
  // The old slug is gone and the key survives under a new slug. That is a
  // rename, and reinstating would leave two slugs sharing one Figma key, which
  // silently costs one of them its ledger entry (buildIdentity is keyed by key).
  const before = {
    components: { "card-for-items": { name: "Card for items", key: "abc123" } },
  };
  const after = { components: { card: { name: "Card", key: "abc123" } } };
  const r = D.resolve({
    deferrals: [LIVE],
    kitId: "dsKit",
    before,
    after,
    now: "2026-08-18T07:00:00.000Z",
  });
  assert.equal(
    r.apply.length,
    0,
    "must refuse: this is a rename, not a removal",
  );
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /rename/i);
  assert.match(r.errors[0], /card/);
});

test("a deferral naming an unknown kit is an error, not silently dropped", () => {
  const { before, after } = fixture();
  const r = D.resolve({
    deferrals: [Object.assign({}, LIVE, { kit: "dskit" })], // wrong casing
    kitId: "dsKit",
    knownKits: ["dsKit", "fmKit", "metaKit"],
    before,
    after,
    now: "2026-08-18T07:00:00.000Z",
  });
  assert.equal(r.errors.length, 1, "a typo'd kit must not vanish");
  assert.match(r.errors[0], /kit/i);
});

test("review_by must be a real date, not merely date-shaped", () => {
  const { before, after } = fixture();
  for (const bad of ["2026-02-31", "2026-13-01", "2026-00-10"]) {
    const r = D.resolve({
      deferrals: [Object.assign({}, LIVE, { review_by: bad })],
      kitId: "dsKit",
      before,
      after,
      now: "2026-08-18T07:00:00.000Z",
    });
    assert.equal(r.apply.length, 0, bad + " must not apply");
    assert.match(r.errors[0] || "", /review_by/, bad + " must be rejected");
  }
});

test("key is required, so two missing keys cannot match each other", () => {
  const before = {
    components: { "card-for-items": { name: "Card for items" } },
  }; // no key
  const after = { components: {} };
  const noKey = Object.assign({}, LIVE);
  delete noKey.key;
  const r = D.resolve({
    deferrals: [noKey],
    kitId: "dsKit",
    before,
    after,
    now: "2026-08-18T07:00:00.000Z",
  });
  assert.equal(r.apply.length, 0, "undefined must not match undefined");
  assert.match(r.errors[0] || "", /key/i);
});

test("a malformed deferrals file is loud, not an empty list", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const sync = require("../scripts/sync/sync-from-figma.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "defer-malformed-"));
  try {
    const srcDir = path.join(dir, "components", "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const file = path.join(srcDir, "sync-deferrals.json");

    // absent file is fine and means "none" — the safe default
    assert.deepEqual(sync.loadDeferrals(dir), []);

    // present but shaped wrong must NOT read as "defer nothing" silently
    for (const bad of ['{"deferals": []}', '{"deferrals": {}}', "[]"]) {
      fs.writeFileSync(file, bad);
      assert.throws(
        () => sync.loadDeferrals(dir),
        /deferrals/i,
        "malformed content: " + bad,
      );
    }

    fs.writeFileSync(file, '{"deferrals": []}');
    assert.deepEqual(
      sync.loadDeferrals(dir),
      [],
      "the empty-but-valid case still works",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the anatomy phase does not report a deferred slug's missing node as a failure", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { syncAnatomy } = require("../scripts/sync/sync-anatomy.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "defer-anatomy-"));
  try {
    const registriesDir = path.join(dir, "registries");
    const anatomyDir = path.join(dir, "anatomy");
    fs.mkdirSync(registriesDir, { recursive: true });
    fs.mkdirSync(anatomyDir, { recursive: true });
    fs.writeFileSync(
      path.join(registriesDir, "dskit.json"),
      JSON.stringify({
        library: "ds",
        fileKey: "F",
        components: {
          "card-for-items": {
            name: "Card for items",
            key: "K-CARD",
            nodeId: "10:1",
            category: "Data Display",
          },
        },
      }),
    );
    // Figma returns no node for it, because it really has stopped publishing it.
    const rest = { getNodes: async () => ({ nodes: {} }) };
    const opts = {
      rest,
      registriesDir,
      anatomyDir,
      keys: { dsKit: "F" },
      writeJson: (f, d) => fs.writeFileSync(f, JSON.stringify(d)),
      syncedAt: "2026-08-18",
    };

    const without = await syncAnatomy(opts, "dsKit");
    assert.match(
      without.verdict.changelog,
      /FAILED/,
      "control: without the deferral it is reported as a failure",
    );

    const withDeferral = await syncAnatomy(
      Object.assign({}, opts, { deferredSlugs: ["card-for-items"] }),
      "dsKit",
    );
    assert.doesNotMatch(
      withDeferral.verdict.changelog,
      /FAILED/,
      "a deferred slug's absent node is expected, not a fetch failure",
    );
    assert.match(withDeferral.verdict.changelog, /deferred-removal/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
