"use strict";

// Harvest driver — glues token-bindings-lib (pure parsing/grading) to the
// filesystem: reads captured Figma design-context text + anatomy dist trees,
// intersects parsed bindings against each component's own-node set (excluding
// instance subtrees), Ajv-validates, and writes per-slug sidecars + a
// coverage report via the shared dist-io primitives.
//
// See schemas/token-bindings.json for the sidecar shape and
// scripts/components/token-bindings-lib.js for the pure parsing/grading
// functions this driver composes.

const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const { stableStringify, writeAtomic } = require("../lib/dist-io");
const {
  parseDesignContext,
  buildTokenNameSet,
  buildSidecar,
  bindingGradeStats,
  renderCoverage,
} = require("./token-bindings-lib");

// Recursively collect the `id` of every node in the anatomy tree whose
// `kind !== "instance"`. Instances are leaves rendered by their own
// component — their internal nodes (and any primitive-token leaks inside
// them) are excluded from this component's own harvested bindings.
//
// This is an explicit instance-boundary guard, not a byproduct of the
// "instances have no children" anatomy convention: that convention is not
// schema-enforced, so if an instance node ever carried children (future
// sync change, malformed input) we must still stop at the boundary rather
// than silently walking into the instance's internals.
function collectOwnNodeIds(node, out) {
  if (!node || typeof node !== "object") return out;
  if (node.kind === "instance") return out; // instance boundary: exclude own id, never descend
  if (node.id) out.add(node.id);
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectOwnNodeIds(child, out);
  }
  return out;
}

function loadSchema() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  return JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "schemas", "token-bindings.json"),
      "utf8",
    ),
  );
}

function makeValidator(schema) {
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

function assertValid(validate, doc, label) {
  if (validate(doc)) return;
  const errs = (validate.errors || [])
    .map((e) => (e.instancePath || "(root)") + " " + e.message)
    .join("; ");
  throw new Error(label + " failed schema validation: " + errs);
}

// run({ captureDir, tokensPath, anatomyDir, outDir, slugs, harvestedAt })
// For each slug: parse captured design-context text, intersect with the
// anatomy own-node set, validate, and write a sidecar. Slugs with no
// captured text, no anatomy, or an empty intersection are skipped
// gracefully (recorded in the coverage report, not thrown).
function run(opts) {
  opts = opts || {};
  const { captureDir, tokensPath, anatomyDir, outDir, slugs, harvestedAt } =
    opts;
  const schema = loadSchema();
  const validate = makeValidator(schema);

  const tokensJson = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
  const tokenNameSet = buildTokenNameSet(tokensJson);

  const writtenDocs = {};
  const skipped = [];

  (slugs || []).forEach((slug) => {
    const captureAbs = path.join(captureDir, slug + ".design-context.txt");
    if (!fs.existsSync(captureAbs)) {
      skipped.push(slug);
      return;
    }
    const text = fs.readFileSync(captureAbs, "utf8");
    const parsedByNode = parseDesignContext(text);

    const anatomyAbs = path.join(anatomyDir, slug + ".json");
    if (!fs.existsSync(anatomyAbs)) {
      skipped.push(slug);
      return;
    }
    let anatomy;
    try {
      anatomy = JSON.parse(fs.readFileSync(anatomyAbs, "utf8"));
    } catch (err) {
      skipped.push(slug);
      return;
    }
    const ownNodeIds = collectOwnNodeIds(anatomy.root, new Set());

    const filtered = {};
    Object.keys(parsedByNode).forEach((nodeId) => {
      if (!ownNodeIds.has(nodeId)) return;
      filtered[nodeId] = parsedByNode[nodeId];
    });

    if (Object.keys(filtered).length === 0) {
      skipped.push(slug);
      return;
    }

    const doc = buildSidecar(slug, filtered, tokenNameSet, harvestedAt);
    assertValid(
      validate,
      doc,
      "components/dist/token-bindings/" + slug + ".json",
    );

    writeAtomic(path.join(outDir, slug + ".json"), stableStringify(doc));
    writtenDocs[slug] = doc;
  });

  const stats = bindingGradeStats(writtenDocs);
  let coverage = renderCoverage(stats);
  if (skipped.length > 0) {
    coverage +=
      "## Skipped\n\n" +
      "> No sidecar written — capture text, anatomy, or the own-node intersection was missing/empty.\n\n" +
      skipped
        .slice()
        .sort()
        .map((s) => "- " + s)
        .join("\n") +
      "\n";
  }
  writeAtomic(path.join(outDir, "coverage.md"), coverage);

  return { written: writtenDocs, skipped };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI
// ───────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--capture-dir") args.captureDir = argv[++i];
    else if (a === "--tokens") args.tokensPath = argv[++i];
    else if (a === "--anatomy-dir") args.anatomyDir = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--slugs") args.slugs = argv[++i].split(",").filter(Boolean);
  }
  return args;
}

function defaultPaths() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  return {
    repoRoot,
    captureDir: path.join(repoRoot, "components", "dist", "captures"),
    tokensPath: path.join(repoRoot, "tokens", "tokens.json"),
    anatomyDir: path.join(repoRoot, "components", "dist", "anatomy"),
    outDir: path.join(repoRoot, "components", "dist", "token-bindings"),
  };
}

function runCli() {
  const args = parseArgs(process.argv);
  const d = defaultPaths();
  const opts = {
    captureDir: args.captureDir || d.captureDir,
    tokensPath: args.tokensPath || d.tokensPath,
    anatomyDir: args.anatomyDir || d.anatomyDir,
    outDir: args.outDir || d.outDir,
    slugs: args.slugs || [],
    harvestedAt: new Date().toISOString(),
  };

  let result;
  try {
    result = run(opts);
  } catch (err) {
    console.error("[harvest-token-bindings] " + err.message);
    process.exit(2);
    return;
  }

  const writtenCount = Object.keys(result.written).length;
  console.log(
    "[harvest-token-bindings] wrote " +
      writtenCount +
      " sidecar(s)" +
      (result.skipped.length > 0
        ? "; skipped " +
          result.skipped.length +
          ": " +
          result.skipped.join(", ")
        : ""),
  );
}

if (require.main === module) {
  runCli();
}

module.exports = {
  run,
  runCli,
  collectOwnNodeIds,
};
