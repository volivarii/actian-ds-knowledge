"use strict";

// Tests for scripts/components/derive-identity.js — the identity ledger.
//
// Why this layer exists: every registry entry already carries a stable Figma
// `key` and `nodeId`, and the sync already uses them to tell a rename apart
// from a delete-plus-add. Nothing downstream did: the slug (a slugified
// DISPLAY NAME) is the address in 15 of 18 manifest collections, in the
// manifest keys themselves, and in the authored `components/src/<slug>/`
// directories. So one Figma rename cost ~90 references across three repos and
// stalled the nightly sync for four nights (knowledge #526).
//
// The ledger makes identity the record and the slug a label: key → current
// slug plus the slugs it used to have.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");

var identity = require("../scripts/components/derive-identity.js");

// A registry as the sync transforms it: components keyed BY SLUG, each entry
// carrying the stable Figma identity.
function registry(bySlug) {
  return { components: bySlug };
}

test("a renamed component keeps its old slug as a previous slug", function () {
  var before = {
    schemaVersion: "1.0.0",
    entries: {
      KEY_A: { slug: "sticky-footer", nodeId: "14747:9839", previousSlugs: [] },
    },
  };
  var after = registry({
    "action-bar": { key: "KEY_A", nodeId: "14747:9839" },
  });

  var ledger = identity.buildIdentity([after], before);

  assert.equal(ledger.entries.KEY_A.slug, "action-bar");
  assert.deepEqual(ledger.entries.KEY_A.previousSlugs, ["sticky-footer"]);
});

// A renamed-back component is not hypothetical: the 08-14 segmented-control
// case showed axis names flapping, and a display name can flap the same way.
// Left unhandled, `previousSlugs` grows on every flap and ends up listing the
// slug the component currently answers to, which would make a resolver map a
// live slug onto itself while reporting it as retired.
test("renaming back does not list the current slug, and does not duplicate", function () {
  var before = {
    schemaVersion: "1.0.0",
    entries: {
      KEY_A: {
        slug: "action-bar",
        nodeId: "14747:9839",
        previousSlugs: ["sticky-footer"],
      },
    },
  };
  var after = registry({
    "sticky-footer": { key: "KEY_A", nodeId: "14747:9839" },
  });

  var ledger = identity.buildIdentity([after], before);

  assert.equal(ledger.entries.KEY_A.slug, "sticky-footer");
  assert.deepEqual(ledger.entries.KEY_A.previousSlugs, ["action-bar"]);
});

// ---------------------------------------------------------------------------
// writeIdentity — the on-disk artifact
// ---------------------------------------------------------------------------

function tmpRepo(registries, ledger) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "identity-"));
  fs.mkdirSync(path.join(root, "components", "dist", "registries"), {
    recursive: true,
  });
  Object.keys(registries).forEach(function (file) {
    fs.writeFileSync(
      path.join(root, "components", "dist", "registries", file + ".json"),
      JSON.stringify(registries[file]),
    );
  });
  if (ledger) {
    fs.writeFileSync(
      path.join(root, "components", "dist", "identity.json"),
      JSON.stringify(ledger, null, 2) + "\n",
    );
  }
  return root;
}

test("writeIdentity records a rename found across the committed registries", function () {
  var root = tmpRepo(
    { dskit: registry({ "action-bar": { key: "KEY_A", nodeId: "1:1" } }) },
    {
      schemaVersion: "1.0.0",
      entries: {
        KEY_A: { slug: "sticky-footer", nodeId: "1:1", previousSlugs: [] },
      },
    },
  );

  var res = identity.writeIdentity(root);

  var written = JSON.parse(
    fs.readFileSync(path.join(root, "components", "dist", "identity.json"), "utf8"),
  );
  assert.equal(res.wrote, true);
  assert.equal(written.entries.KEY_A.slug, "action-bar");
  assert.deepEqual(written.entries.KEY_A.previousSlugs, ["sticky-footer"]);
  assert.equal(written._meta.auto_generated, true);
  fs.rmSync(root, { recursive: true, force: true });
});

// Re-running a derive must not churn the artifact: a byte-unstable derive shows
// up as a diff on every unrelated PR and trains everyone to ignore it.
test("writeIdentity is idempotent: a second run reports no change", function () {
  var root = tmpRepo({
    dskit: registry({ "action-bar": { key: "KEY_A", nodeId: "1:1" } }),
  });

  var first = identity.writeIdentity(root);
  var bytes = fs.readFileSync(
    path.join(root, "components", "dist", "identity.json"),
    "utf8",
  );
  var second = identity.writeIdentity(root);

  assert.equal(first.wrote, true);
  assert.equal(second.wrote, false);
  assert.equal(
    fs.readFileSync(
      path.join(root, "components", "dist", "identity.json"),
      "utf8",
    ),
    bytes,
  );
  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The shipped artifact conforms to its schema
// ---------------------------------------------------------------------------

test("the committed ledger validates, and the validator is not vacuous", function () {
  var Ajv = require("ajv/dist/2020");
  var addFormats = require("ajv-formats");
  var ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  var validate = ajv.compile(
    JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "schemas", "identity.json"), "utf8"),
    ),
  );

  var committed = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "components", "dist", "identity.json"),
      "utf8",
    ),
  );
  assert.ok(
    validate(committed),
    "committed ledger must validate: " + JSON.stringify(validate.errors),
  );

  // Non-vacuity: a validator that accepts anything would pass the line above
  // while proving nothing. An entry listing its own current slug as a previous
  // one is the specific corruption the builder exists to prevent, so it is the
  // right shape to prove the validator is live.
  assert.equal(
    validate({
      _meta: committed._meta,
      schemaVersion: "1.0.0",
      entries: { KEY: { slug: "action-bar", previousSlugs: [""] } },
    }),
    false,
    "an empty previous slug must not validate",
  );
});

// The committed ledger must be what a fresh derive produces. This is the test
// half of the freshness promise that lets `identity` sit in INFRA_DERIVES with
// no domains.json unit; the other half is the drift guard in
// validate-manifest.yml. A stale ledger does not fail loudly on its own: it
// resolves a renamed-away slug to the wrong component, or stops resolving it.
test("the committed ledger is what a fresh derive produces", function () {
  var repoRoot = path.join(__dirname, "..");
  var registriesDir = path.join(repoRoot, "components", "dist", "registries");
  var registries = fs
    .readdirSync(registriesDir)
    .filter(function (f) {
      return f.endsWith(".json");
    })
    .sort()
    .map(function (f) {
      return JSON.parse(fs.readFileSync(path.join(registriesDir, f), "utf8"));
    });

  var committedBytes = fs.readFileSync(
    path.join(repoRoot, "components", "dist", "identity.json"),
    "utf8",
  );
  var committed = JSON.parse(committedBytes);
  var fresh = identity.serialize(
    identity.buildIdentity(registries, committed),
  );

  assert.equal(
    fresh,
    committedBytes,
    "run `npm run derive:identity` and commit the result",
  );
});

// A malformed registry used to be swallowed: readJson returned null for every
// error and the entry was filtered out, so the ledger was rewritten without
// those identities AND without the rename history they carried, exiting 0. The
// sync orchestrator runs with continue-on-error, so a truncated dskit.json is
// reachable.
test("writeIdentity refuses to rewrite the ledger from an unreadable registry", function () {
  var root = tmpRepo({
    dskit: registry({ "action-bar": { key: "KEY_A", nodeId: "1:1" } }),
  });
  fs.writeFileSync(
    path.join(root, "components", "dist", "registries", "dskit.json"),
    "{ truncated",
  );

  assert.throws(function () {
    identity.writeIdentity(root);
  }, /dskit\.json/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("writeIdentity refuses to write an empty ledger when no registry is present", function () {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "identity-"));
  fs.mkdirSync(path.join(root, "components", "dist"), { recursive: true });

  assert.throws(function () {
    identity.writeIdentity(root);
  }, /no registries/i);
  fs.rmSync(root, { recursive: true, force: true });
});

// Two components can each have carried the same slug at different times. Mapping
// it silently to whichever identity sorts later hands back an arbitrary
// component, so the collision has to be dropped rather than guessed.
test("a retired slug claimed by two identities is not mapped at all", function () {
  var rp = require("../clients/resolve-paths.js");
  var index = rp.buildRenameIndex({
    schemaVersion: "1.0.0",
    entries: {
      KEY_A: { slug: "alpha", nodeId: "1:1", previousSlugs: ["panel"] },
      KEY_B: { slug: "beta", nodeId: "2:2", previousSlugs: ["panel"] },
    },
  });
  assert.equal(index.panel, undefined, "an ambiguous retired slug must not map");
});

// readLedger treats an unreadable ledger as "no renames" so a bad file cannot
// wedge a consumer, but a JSON-valid ledger with the wrong shape used to throw a
// TypeError out of buildPaths and take down all path resolution. The schema gates
// this repo's CI, not a vendored snapshot.
test("a structurally wrong ledger degrades to no renames instead of throwing", function () {
  var rp = require("../clients/resolve-paths.js");
  [
    { entries: { K: { slug: "a", previousSlugs: "not-an-array" } } },
    { entries: { K: { slug: "a", previousSlugs: { 0: "x" } } } },
    { entries: { K: null } },
    { entries: "nope" },
  ].forEach(function (bad) {
    var index = rp.buildRenameIndex(bad);
    assert.equal(typeof index, "object", "must return a map, not throw");
  });
});

// ---------- rename-induced aliases (#552) ----------
//
// A rename leaves the AUTHORED directory behind: Figma renames the component to
// `action-bar` while the guidance stays in `components/src/sticky-footer/`. The
// registryAliases mechanism already expresses exactly that (registry key -> the
// doc slug that serves it), and the ledger already knows the pair, so the entry
// is derivable instead of hand-written. Editorial aliases stay hand-written:
// "this family doc covers these components" is not something a ledger can know.

test("a rename whose authored directory did not move yields an alias", () => {
  const ledger = {
    entries: {
      K1: { slug: "action-bar", previousSlugs: ["sticky-footer"] },
    },
  };
  assert.deepEqual(
    identity.renameAliases(ledger, ["sticky-footer"], ["action-bar"]),
    { "action-bar": "sticky-footer" },
  );
});

test("no alias once the authored directory has been moved to the new name", () => {
  const ledger = {
    entries: {
      K1: { slug: "action-bar", previousSlugs: ["sticky-footer"] },
    },
  };
  // The convergence happened, so an alias would be the redundant kind
  // resolveRegistryAliases already refuses.
  assert.deepEqual(
    identity.renameAliases(ledger, ["action-bar"], ["action-bar"]),
    {},
  );
});

test("no alias for a rename whose component has left the registry", () => {
  const ledger = {
    entries: { K1: { slug: "action-bar", previousSlugs: ["sticky-footer"] } },
  };
  // Nothing ships under `action-bar`, so pointing a registry key at the old
  // guidance would invent reachability that does not exist.
  assert.deepEqual(identity.renameAliases(ledger, ["sticky-footer"], []), {});
});

test("no alias when the old slug never had authored guidance", () => {
  const ledger = {
    entries: { K1: { slug: "action-bar", previousSlugs: ["sticky-footer"] } },
  };
  assert.deepEqual(identity.renameAliases(ledger, [], ["action-bar"]), {});
});
