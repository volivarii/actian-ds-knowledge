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

// Stable identity for a registry entry, most durable first.
//
// Precedence differs from its two neighbours on purpose, and the difference is
// worth stating because it is where a disagreement would hide:
//   - the sync's identityOf(slug, comp) is `key || nodeId || slug` (three tiers,
//     sync-from-figma.js), because it must classify every entry it sees;
//   - the differ that decides the breaking verdict pairs renames by `key` ONLY
//     (changelog-classifier.js), with no nodeId fallback;
//   - this returns `key || nodeId` and SKIPS an entry with neither, because a
//     ledger keyed by slug would defeat the whole point.
// So for a keyless entry this would record a rename by nodeId while the
// classifier reported a removal plus an addition. Latent today: all 637 entries
// carry a key, and Figma gives every published component one.
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
            "Regenerate with `npm run derive:identity`. `slug` and `nodeId` are re-derived from the registries and a hand edit to them is overwritten. `previousSlugs` ACCUMULATES and is carried forward verbatim, so a hand edit there survives regeneration and the drift guard: it is history, not derivable from current state.",
        },
        schemaVersion: ledger.schemaVersion,
        entries: entries,
      },
      null,
      2,
    ) + "\n"
  );
}

// Registries are the authority this ledger is derived from, so an unreadable one
// must stop the derive rather than shrink the output. Swallowing it rewrote the
// ledger without those identities and without the rename history they carried,
// and exited 0. The sync orchestrator runs with continue-on-error, so a truncated
// registry is reachable.
function readRegistry(file) {
  var raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(
      "derive-identity: cannot read registry " + file + ": " + err.message,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      "derive-identity: " +
        file +
        " is not valid JSON (" +
        err.message +
        "). Refusing to rewrite the ledger from a partial registry set, which " +
        "would drop identities and their rename history.",
    );
  }
}

// The committed ledger is different: absent is the normal first-run state, and a
// corrupt one must not wedge the derive. It is rebuilt from the registries, so
// the only loss is history, and that loss is reported rather than silent.
function readLedgerOrNull(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(
      "derive-identity: committed ledger at " +
        file +
        " is unreadable (" +
        err.message +
        "). Rebuilding without rename history.",
    );
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
  if (files.length === 0) {
    throw new Error(
      "derive-identity: no registries found in " +
        registriesDir +
        ". Refusing to write an empty ledger, which would erase every identity " +
        "and its rename history.",
    );
  }

  var registries = files.sort().map(function (f) {
    return readRegistry(path.join(registriesDir, f));
  });

  var previous = readLedgerOrNull(ledgerPath);
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
