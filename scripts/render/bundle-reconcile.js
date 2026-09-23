"use strict";

// bundle-reconcile.js — diff what the substrate can produce against what is
// live in a Claude Design design-system project.
//
// build-bundle.js emits one card per RENDER_SLUGS slug plus the three
// foundations cards. RENDER_SLUGS is derived from the `case "<slug>":` branches
// in ds-html-map.js, so a card in the project with no such branch cannot be
// reproduced: a rebuild omits it and a push never deletes it. On 2026-09-23 the
// dogfood carried ten such cards and nothing in this repository said so.
//
// components/render/bundle-external.json is where we say so. This script is the
// check: a live card that is neither produced nor declared there is drift, and
// exits 1. A produced card that is not yet live is only reported; pushing is a
// separate act.
//
// The live listing comes from DesignSync's list_files (an agent or a person
// pastes it into a JSON file), because this repository has no credentials for
// the project and should not grow any. That is also why this is a script and
// not a `npm test` gate: a check that needs a remote cannot live in the suite.
//
//   node scripts/render/bundle-reconcile.js --live live-paths.json
//   node scripts/render/bundle-reconcile.js --live live-paths.json --json

var fs = require("node:fs");
var path = require("node:path");
var os = require("node:os");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var EXTERNAL_PATH = path.join(
  REPO_ROOT,
  "components",
  "render",
  "bundle-external.json",
);

function isCard(p) {
  // A card is an .html file in a group folder at the top level. Usage notes,
  // the manifest, the thumbnail and anything under templates/ are not cards.
  if (typeof p !== "string" || !/\.html$/.test(p)) return false;
  if (/^templates\//.test(p)) return false;
  var parts = p.split("/");
  return parts.length === 2 && parts[0].length > 0;
}

// Pure, so the failure modes are testable without a network or a 39 MB build.
function reconcile(input) {
  var produced = (input.produced || []).filter(isCard);
  var live = (input.live || []).filter(isCard);
  var external = input.external || [];

  var producedSet = Object.create(null);
  produced.forEach(function (p) {
    producedSet[p] = 1;
  });
  var liveSet = Object.create(null);
  live.forEach(function (p) {
    liveSet[p] = 1;
  });
  // Matched on the full card path, never on the slug as a substring: "rich-text"
  // is a prefix of "rich-text-froala", and a substring match would let a live
  // card hide behind an unrelated retirement.
  var declared = Object.create(null);
  external.forEach(function (e) {
    if (e && typeof e.path === "string") declared[e.path] = e;
  });

  var missing = produced.filter(function (p) {
    return !liveSet[p];
  });
  var extraDeclared = [];
  var extraUndeclared = [];
  live.forEach(function (p) {
    if (producedSet[p]) return;
    if (declared[p]) extraDeclared.push(declared[p]);
    else extraUndeclared.push(p);
  });

  return {
    produced: produced.length,
    live: live.length,
    missing: missing.sort(),
    extraDeclared: extraDeclared,
    extraUndeclared: extraUndeclared.sort(),
    ok: extraUndeclared.length === 0,
  };
}

function readExternal() {
  return JSON.parse(fs.readFileSync(EXTERNAL_PATH, "utf8")).cards || [];
}

// Build into a throwaway directory and take the card paths from the build
// itself, rather than restating build-bundle's own path logic here. A second
// copy of that logic is a second thing to keep in step.
function producedPaths() {
  var buildBundle = require("./build-bundle.js").buildBundle;
  var out = fs.mkdtempSync(path.join(os.tmpdir(), "ds-bundle-"));
  try {
    return buildBundle(out).written.filter(isCard);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

if (require.main === module) {
  var i = process.argv.indexOf("--live");
  if (i < 0 || !process.argv[i + 1]) {
    process.stderr.write(
      "usage: node scripts/render/bundle-reconcile.js --live <paths.json> [--json]\n" +
        "  <paths.json> is the DesignSync list_files array for the project.\n",
    );
    process.exit(2);
  }
  var livePaths = JSON.parse(
    fs.readFileSync(path.resolve(process.argv[i + 1]), "utf8"),
  );
  if (livePaths && Array.isArray(livePaths.paths)) livePaths = livePaths.paths;
  if (!Array.isArray(livePaths)) {
    process.stderr.write(
      "RECONCILE ABORTED: --live must hold a JSON array of paths, or the " +
        "{ paths: [...] } object list_files returns; got " +
        typeof livePaths +
        ".\n",
    );
    process.exit(2);
  }
  // A listing that yields no cards is almost always a failed or truncated
  // list_files, not an empty project, and it would otherwise sail through:
  // nothing live means nothing undeclared means ok. Absence must not read as a
  // pass. --allow-empty is for the genuinely empty project.
  if (
    !livePaths.filter(isCard).length &&
    process.argv.indexOf("--allow-empty") < 0
  ) {
    process.stderr.write(
      "RECONCILE ABORTED: the --live listing holds no card paths (" +
        livePaths.length +
        " entries read). That reads as a pass while proving nothing. Re-take " +
        "the listing, or pass --allow-empty if the project really is empty.\n",
    );
    process.exit(2);
  }
  var result = reconcile({
    produced: producedPaths(),
    live: livePaths,
    external: readExternal(),
  });

  if (process.argv.indexOf("--json") >= 0) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(
      "produced " + result.produced + " cards, live " + result.live + "\n",
    );
    process.stdout.write(
      "\nnot yet pushed (" +
        result.missing.length +
        "):\n" +
        result.missing
          .map(function (p) {
            return "  + " + p + "\n";
          })
          .join(""),
    );
    process.stdout.write(
      "\nlive and declared external (" +
        result.extraDeclared.length +
        "):\n" +
        result.extraDeclared
          .map(function (e) {
            return "  = " + e.path + "  [" + e.status + "]\n";
          })
          .join(""),
    );
    process.stdout.write(
      "\nlive, NOT produced, NOT declared (" +
        result.extraUndeclared.length +
        "):\n" +
        result.extraUndeclared
          .map(function (p) {
            return "  ! " + p + "\n";
          })
          .join(""),
    );
  }

  if (!result.ok) {
    process.stderr.write(
      "\nRECONCILE FAILED: " +
        result.extraUndeclared.length +
        " live card(s) the substrate does not produce and " +
        "components/render/bundle-external.json does not declare. Either author " +
        "the leaf, or add an entry saying why the card lives outside the substrate.\n",
    );
    process.exitCode = 1;
  }
}

module.exports = { reconcile: reconcile, isCard: isCard };
