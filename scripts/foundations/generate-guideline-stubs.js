"use strict";

// Auto-generates JSON guideline stubs for set-importable DS Kit components
// that don't yet have a hand-curated guideline. Pure derive — reads
// components/registries/dskit.json + components/guidelines/, writes one
// stub per missing slug. Idempotent (skip-if-exists). Updates _index.json.
//
// Hooked into the Sync from Figma workflow so net-new components from
// REST sync get stubs immediately, keeping coverage at 100% structural.
//
// CLI:
//   node scripts/foundations/generate-guideline-stubs.js [--dry-run] [--report]
//
// Flags are independent and combinable:
//   --dry-run        prints the planned stub list without writing
//   --report         prints generated/skipped/denylisted counts
//   --dry-run --report   prints both (planned list + counts)
//   (no flags)       writes stubs and prints "Generated N stubs."
//
// Programmatic:
//   var { generateStubs } = require("./generate-guideline-stubs.js");
//   generateStubs({ registryPath, guidelinesDir, indexPath, dryRun? }) -> result

var fs = require("fs");
var path = require("path");

// Slugs that match these patterns are non-briefable (logos, brand assets,
// layout grids, typos). Add to this list as new patterns surface; each
// addition is a one-line PR.
var DENYLIST_PATTERNS = [
  /-logo$/, // brand assets
  /-favicon$/, // brand assets
  /-grid$/, // layout primitives (xs-grid, xl-grid, etc.)
  /^actian-/, // brand assets (actian-data-intelligence-dev-logo, etc.)
  /^zeenea-/, // brand assets
  /^white-label-/, // brand assets
  /^component-\d+$/, // generic placeholders (component-1, component-2, etc.)
];

var DENYLIST_EXACT = new Set([
  "illustration",
  "toglge", // Figma typo (per project_sprint_1_wip.md)
]);

function isDenylisted(slug) {
  if (DENYLIST_EXACT.has(slug)) return true;
  return DENYLIST_PATTERNS.some(function (re) {
    return re.test(slug);
  });
}

function computeTotalVariants(axes) {
  var keys = Object.keys(axes || {});
  if (keys.length === 0) return 0;
  return keys.reduce(function (acc, k) {
    return acc * (Array.isArray(axes[k]) ? axes[k].length : 1);
  }, 1);
}

function buildStub(slug, registryEntry, nowIso) {
  return {
    component: registryEntry.name,
    _stub: true,
    _stubGeneratedAt: nowIso,
    page_id: registryEntry.nodeId || null,
    extracted_at: nowIso,
    frames_found: [],
    frames_missing: [
      "Design guidelines",
      "Content guidelines",
      "Components",
      "Screenshots of use cases",
      "Behavior demo",
      "ready made examples",
    ],
    content_guidelines: null,
    design_guidelines: null,
    variants: {
      axes: registryEntry.variants || {},
      totalVariants: computeTotalVariants(registryEntry.variants || {}),
    },
    examples: null,
    screenshots: null,
    behavior: null,
  };
}

function buildIndexEntry(slug, registryEntry, nowIso) {
  return {
    slug: slug,
    component: registryEntry.name,
    page_id: registryEntry.nodeId || null,
    extracted_at: nowIso,
    _stub: true,
    has_content_guidelines: false,
    has_design_guidelines: false,
    has_examples: false,
    has_screenshots: false,
    has_behavior: false,
    frames_found: [],
    frames_missing: [
      "Design guidelines",
      "Content guidelines",
      "Components",
      "Screenshots of use cases",
      "Behavior demo",
      "ready made examples",
    ],
  };
}

function generateStubs(opts) {
  var registry = JSON.parse(fs.readFileSync(opts.registryPath, "utf8"));
  if (
    !registry ||
    typeof registry.components !== "object" ||
    registry.components === null
  ) {
    throw new Error(
      "Invalid registry at " +
        opts.registryPath +
        ": missing or non-object 'components' key",
    );
  }
  var guidelinesDir = opts.guidelinesDir;
  var indexPath = opts.indexPath;
  var dryRun = !!opts.dryRun;
  var nowIso = (opts.now || new Date()).toISOString();

  var existingFiles = new Set(
    fs
      .readdirSync(guidelinesDir)
      .filter(function (f) {
        return f.endsWith(".json") && f !== "_index.json";
      })
      .map(function (f) {
        return f.replace(/\.json$/, "");
      }),
  );

  var generated = [];
  var skipped = [];
  var denylisted = [];

  Object.keys(registry.components).forEach(function (slug) {
    var entry = registry.components[slug];
    if (entry.importMethod !== "set") return; // singles are out of scope, silently
    if (isDenylisted(slug)) {
      denylisted.push(slug);
      return;
    }
    if (existingFiles.has(slug)) {
      skipped.push(slug);
      return;
    }
    generated.push(slug);
  });

  if (dryRun) {
    return {
      generated: generated,
      skipped: skipped,
      denylisted: denylisted,
      indexUpdated: false,
    };
  }

  // Fail-fast: read + parse index BEFORE writing any stubs. If the index is
  // missing or malformed, an early throw prevents orphaned stub files from
  // being left on disk (where they'd be invisible to consumers reading the
  // index).
  var index = null;
  if (generated.length > 0) {
    index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  }

  // Phase B dual-publish: optional legacy guidelines dir gets the same
  // stubs + index updates as the canonical guidelines dir. Removed in
  // Phase D when legacy paths are dropped.
  var legacyGuidelinesDir = opts.legacyGuidelinesDir || null;
  var legacyIndexPath = legacyGuidelinesDir
    ? path.join(legacyGuidelinesDir, "_index.json")
    : null;

  // Write stub files
  generated.forEach(function (slug) {
    var entry = registry.components[slug];
    var stub = buildStub(slug, entry, nowIso);
    var serialized = JSON.stringify(stub, null, 2) + "\n";
    fs.writeFileSync(
      path.join(guidelinesDir, slug + ".json"),
      serialized,
      "utf8",
    );
    if (legacyGuidelinesDir) {
      fs.writeFileSync(
        path.join(legacyGuidelinesDir, slug + ".json"),
        serialized,
        "utf8",
      );
    }
  });

  // Update _index.json (append stub entries)
  var indexUpdated = false;
  if (generated.length > 0) {
    var existingSlugs = new Set(
      index.components.map(function (c) {
        return c.slug;
      }),
    );
    generated.forEach(function (slug) {
      if (existingSlugs.has(slug)) return; // safety
      var entry = registry.components[slug];
      index.components.push(buildIndexEntry(slug, entry, nowIso));
    });
    index.total_components = index.components.length;
    index.extracted_at = nowIso;
    var indexSerialized = JSON.stringify(index, null, 2) + "\n";
    fs.writeFileSync(indexPath, indexSerialized, "utf8");
    if (legacyIndexPath && fs.existsSync(legacyIndexPath)) {
      // Mirror only when a legacy index already exists — avoids creating
      // an orphan file in legacy if it was already deleted by Phase D.
      fs.writeFileSync(legacyIndexPath, indexSerialized, "utf8");
    }
    indexUpdated = true;
  }

  return {
    generated: generated,
    skipped: skipped,
    denylisted: denylisted,
    indexUpdated: indexUpdated,
  };
}

module.exports = { generateStubs: generateStubs, isDenylisted: isDenylisted };

// CLI: --dry-run / --report. No args = generate.
if (require.main === module) {
  var argv = process.argv.slice(2);
  var dryRun = argv.indexOf("--dry-run") !== -1;
  var report = argv.indexOf("--report") !== -1;

  // Resolves to the knowledge-repo root from scripts/foundations/.
  var repoRoot = path.resolve(__dirname, "..", "..");
  // Phase B canonical paths (registry under components/dist/registries/,
  // stubs under components/src/guidelines/).
  var registryPath = path.join(
    repoRoot,
    "components",
    "dist",
    "registries",
    "dskit.json",
  );
  var guidelinesDir = path.join(repoRoot, "components", "src", "guidelines");
  var indexPath = path.join(guidelinesDir, "_index.json");
  // Phase B dual-publish: also write stubs to the legacy location. Drop
  // legacyGuidelinesDir from this default block in Phase D.
  var legacyGuidelinesDir = path.join(repoRoot, "components", "guidelines");

  var result = generateStubs({
    registryPath: registryPath,
    guidelinesDir: guidelinesDir,
    indexPath: indexPath,
    legacyGuidelinesDir: legacyGuidelinesDir,
    dryRun: dryRun,
  });

  if (dryRun) {
    process.stdout.write("[dry-run] Would generate stubs for:\n");
    result.generated.forEach(function (s) {
      process.stdout.write("  - " + s + "\n");
    });
  }
  if (report) {
    process.stdout.write(
      "Stubs generated: " +
        result.generated.length +
        "\n" +
        "Already covered: " +
        result.skipped.length +
        "\n" +
        "Denylisted: " +
        result.denylisted.length +
        "\n",
    );
  }
  if (!dryRun && !report) {
    process.stdout.write("Generated " + result.generated.length + " stubs.\n");
  }
}
