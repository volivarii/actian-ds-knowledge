"use strict";

// derive-identity — the identity ledger: stable Figma identity → the slug it
// currently answers to, plus the slugs it used to answer to.
//
// Why this exists. Every registry entry already carries a rename-proof Figma
// `key` and a `nodeId`, and the sync already uses them to tell a rename apart
// from a delete-plus-add (`identityOf` in sync-from-figma.js). Nothing
// downstream did. The slug, which is a slugified DISPLAY NAME, is the address
// in 15 of 18 manifest collections, in the manifest keys themselves
// (`components.guidelineDoc.<slug>`), in the media and anatomy filenames, and
// in the authored `components/src/<slug>/` directories. So renaming one Figma
// component cost about 90 references across three repositories and stalled the
// nightly sync for four nights (knowledge #526).
//
// This ledger inverts that: identity is the record, the slug is a label. A
// consumer holding a slug that has since been renamed can resolve it instead of
// breaking on it, which is what lets a rename stop being a migration.

var fs = require("node:fs");
var path = require("node:path");

// Stable identity for a registry entry, most durable first. Deliberately the
// same precedence as `identityOf` in the sync, because the two must agree: if
// the sync pairs a rename by `key` and this ledger keyed by `nodeId`, a rename
// would look like a new entry here and the previous slug would be lost.
function identityOf(entry) {
  return (entry && (entry.key || entry.nodeId)) || null;
}

// Builds the ledger from the CURRENT registries plus the ledger as it was
// committed. `previous` may be null on a first run.
//
// Entries for components that have left the registries are dropped rather than
// tombstoned: their history is in git, and a retired slug should stop resolving
// rather than resolve to something that no longer ships.
function buildIdentity(registries, previous) {
  var prevEntries = (previous && previous.entries) || {};
  var entries = {};

  (registries || []).forEach(function (reg) {
    var components = (reg && reg.components) || {};
    Object.keys(components).forEach(function (slug) {
      var entry = components[slug];
      var id = identityOf(entry);
      if (!id) return;

      var was = prevEntries[id];
      var history = ((was && was.previousSlugs) || []).slice();
      if (was && was.slug && was.slug !== slug) {
        history.push(was.slug);
      }

      // Drop the slug the component currently answers to, and de-duplicate.
      // A display name can flap (rename away and back), and without this the
      // history grows on every flap and ends up naming the live slug, which
      // would let a resolver report a current slug as retired.
      var seen = {};
      var previousSlugs = history.filter(function (s) {
        if (s === slug || seen[s]) return false;
        seen[s] = true;
        return true;
      });

      entries[id] = {
        slug: slug,
        nodeId: entry.nodeId,
        previousSlugs: previousSlugs,
      };
    });
  });

  return { schemaVersion: "1.0.0", entries: entries };
}

// Serialize with sorted identity keys so the artifact is byte-stable for a given
// input. A derive that churns shows up as a diff on unrelated PRs and teaches
// everyone to ignore it.
function serialize(ledger) {
  var entries = {};
  Object.keys(ledger.entries)
    .sort()
    .forEach(function (id) {
      entries[id] = ledger.entries[id];
    });
  return (
    JSON.stringify(
      {
        _meta: {
          auto_generated: true,
          source: "components/dist/registries/*.json",
          do_not_edit:
            "Regenerate with `npm run derive:identity`. Hand edits are overwritten.",
        },
        schemaVersion: ledger.schemaVersion,
        entries: entries,
      },
      null,
      2,
    ) + "\n"
  );
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return null;
  }
}

// Rebuilds the ledger from every committed registry plus the ledger as it stands,
// and writes it only when the bytes change.
function writeIdentity(repoRoot) {
  var distDir = path.join(repoRoot, "components", "dist");
  var registriesDir = path.join(distDir, "registries");
  var ledgerPath = path.join(distDir, "identity.json");

  var files = fs.existsSync(registriesDir)
    ? fs.readdirSync(registriesDir).filter(function (f) {
        return f.endsWith(".json");
      })
    : [];
  // Sorted so the build order, and therefore any insertion-order effect, does
  // not depend on the filesystem's directory order.
  var registries = files
    .sort()
    .map(function (f) {
      return readJson(path.join(registriesDir, f));
    })
    .filter(Boolean);

  var previous = fs.existsSync(ledgerPath) ? readJson(ledgerPath) : null;
  var ledger = buildIdentity(registries, previous);
  var bytes = serialize(ledger);

  var current = fs.existsSync(ledgerPath)
    ? fs.readFileSync(ledgerPath, "utf8")
    : null;
  if (current === bytes)
    return { wrote: false, ledger: ledger, path: ledgerPath };

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(ledgerPath, bytes);
  return { wrote: true, ledger: ledger, path: ledgerPath };
}

module.exports = {
  identityOf: identityOf,
  buildIdentity: buildIdentity,
  serialize: serialize,
  writeIdentity: writeIdentity,
};

if (require.main === module) {
  var res = writeIdentity(path.join(__dirname, "..", ".."));
  var count = Object.keys(res.ledger.entries).length;
  var renamed = Object.keys(res.ledger.entries).filter(function (id) {
    return (res.ledger.entries[id].previousSlugs || []).length > 0;
  }).length;
  console.log(
    "[derive-identity] " +
      count +
      " identities, " +
      renamed +
      " carrying a previous slug — " +
      (res.wrote ? "written" : "unchanged"),
  );
}
