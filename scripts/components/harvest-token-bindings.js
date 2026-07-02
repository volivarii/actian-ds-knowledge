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

// Canonical axis names from the anatomy root's variant name
// ("Status=Fail" / "Type=Item, State=Default"): codegen lowercases prop
// names, the anatomy root carries the Figma casing.
function canonicalAxes(rootName) {
  const map = {};
  String(rootName || "")
    .split(",")
    .forEach((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return;
      const axis = part.slice(0, eq).trim();
      if (axis) map[axis.toLowerCase().replace(/[^a-z0-9]/g, "")] = axis;
    });
  return map;
}

// Rename codegen prop names to canonical Figma axis names across scoped
// bindings + defaults; keep only defaults for axes actually referenced.
function canonicalizeVariants(entries, variantDefaults, rootName) {
  const axes = canonicalAxes(rootName);
  const canon = (p) =>
    axes[
      String(p)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
    ] || p;
  const referenced = new Set();
  const out = entries.map((e) => {
    if (!e.variant) return e;
    const prop = canon(e.variant.prop);
    referenced.add(prop);
    return {
      property: e.property,
      varName: e.varName,
      variant: { prop, values: e.variant.values },
    };
  });
  const defaults = {};
  Object.keys(variantDefaults || {}).forEach((p) => {
    const cp = canon(p);
    if (referenced.has(cp)) defaults[cp] = variantDefaults[p];
  });
  return { entries: out, defaults };
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
// anatomy own-node set, join the set-root bindings (canonicalized), build a
// sidecar doc. ALL docs are validated before ANY are written (a validation
// failure writes nothing and throws listing every failing slug). Coverage is
// then computed from every sidecar JSON on disk in outDir (so previously
// harvested families keep their rows across narrower re-runs). Slugs with no
// captured text, no anatomy, an unjoinable set root, or an empty own-node
// intersection are skipped gracefully (recorded with a reason in the
// coverage report, not thrown).
function run(opts) {
  opts = opts || {};
  const { captureDir, tokensPath, anatomyDir, outDir, slugs, harvestedAt } =
    opts;
  const schema = loadSchema();
  const validate = makeValidator(schema);

  const tokensJson = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
  const tokenNameSet = buildTokenNameSet(tokensJson);

  const docs = {};
  const skipped = [];

  (slugs || []).forEach((slug) => {
    const captureAbs = path.join(captureDir, slug + ".design-context.txt");
    if (!fs.existsSync(captureAbs)) {
      skipped.push({ slug, reason: "no capture" });
      return;
    }
    const parsed = parseDesignContext(fs.readFileSync(captureAbs, "utf8"));

    const anatomyAbs = path.join(anatomyDir, slug + ".json");
    if (!fs.existsSync(anatomyAbs)) {
      skipped.push({ slug, reason: "no anatomy" });
      return;
    }
    let anatomy;
    try {
      anatomy = JSON.parse(fs.readFileSync(anatomyAbs, "utf8"));
    } catch (err) {
      skipped.push({ slug, reason: "unparseable anatomy" });
      return;
    }
    const ownNodeIds = collectOwnNodeIds(anatomy.root, new Set());

    // Own-node intersection over data-node-id elements.
    const nodes = {};
    Object.keys(parsed.nodes).forEach((nodeId) => {
      if (!ownNodeIds.has(nodeId)) return;
      nodes[nodeId] = parsed.nodes[nodeId];
    });

    // Set root: the anatomy root must be among the chain ids; root bindings
    // attach to the anatomy root id (canonical join key for all variants).
    const variantDefaults = {};
    if (parsed.root) {
      const rootId = anatomy.root && anatomy.root.id;
      if (!rootId || parsed.root.ids.indexOf(rootId) === -1) {
        skipped.push({ slug, reason: "anatomy root not among set root ids" });
        return;
      }
      const canon = canonicalizeVariants(
        parsed.root.bindings,
        parsed.variantDefaults,
        anatomy.root.name,
      );
      nodes[rootId] = (nodes[rootId] || []).concat(canon.entries);
      Object.assign(variantDefaults, canon.defaults);
    }

    // Non-root conditional elements (e.g. a state-styled label): attach each
    // to the single anatomy own-node id present in its id chain. An element
    // with no own-node id simply isn't this component's fact (skip silently).
    (parsed.conditionals || []).forEach((el) => {
      const matchId = el.ids.find((id) => ownNodeIds.has(id));
      if (!matchId) return;
      const canonEl = canonicalizeVariants(
        el.bindings,
        parsed.variantDefaults,
        anatomy.root && anatomy.root.name,
      );
      nodes[matchId] = (nodes[matchId] || []).concat(canonEl.entries);
      Object.assign(variantDefaults, canonEl.defaults);
    });

    if (Object.keys(nodes).length === 0) {
      skipped.push({ slug, reason: "empty own-node intersection" });
      return;
    }

    docs[slug] = buildSidecar(
      slug,
      nodes,
      tokenNameSet,
      harvestedAt,
      variantDefaults,
    );
  });

  // Validate ALL before writing ANY (no partial-batch writes).
  const failures = [];
  Object.keys(docs).forEach((slug) => {
    if (!validate(docs[slug])) {
      const errs = (validate.errors || [])
        .map((e) => (e.instancePath || "(root)") + " " + e.message)
        .join("; ");
      failures.push(slug + ": " + errs);
    }
  });
  if (failures.length) {
    throw new Error(
      "schema validation failed, nothing written — " + failures.join(" | "),
    );
  }

  Object.keys(docs).forEach((slug) => {
    writeAtomic(path.join(outDir, slug + ".json"), stableStringify(docs[slug]));
  });

  // Coverage from ALL sidecars on disk (previously harvested families keep
  // their rows when a later run harvests a different slug batch).
  const allDocs = {};
  fs.readdirSync(outDir)
    .filter((f) => f.endsWith(".json"))
    .forEach((f) => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8"));
        if (d && d.byNodeId) allDocs[d.slug || f.replace(/\.json$/, "")] = d;
      } catch (err) {
        /* unreadable sidecar: not this run's problem; committed tests guard it */
      }
    });
  let coverage = renderCoverage(bindingGradeStats(allDocs));
  if (skipped.length > 0) {
    coverage +=
      "## Skipped\n\n" +
      "> No sidecar written — capture text, anatomy, the own-node intersection, or the set-root join was missing/empty.\n\n" +
      skipped
        .slice()
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .map((s) => "- " + s.slug + " (" + s.reason + ")")
        .join("\n") +
      "\n";
  }
  writeAtomic(path.join(outDir, "coverage.md"), coverage);

  return { written: docs, skipped };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI
// ───────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  const next = (i, flag) => {
    const v = argv[i];
    if (v == null || v.startsWith("--"))
      throw new Error(flag + " requires a value");
    return v;
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--capture-dir") args.captureDir = next(++i, a);
    else if (a === "--tokens") args.tokensPath = next(++i, a);
    else if (a === "--anatomy-dir") args.anatomyDir = next(++i, a);
    else if (a === "--out-dir") args.outDir = next(++i, a);
    else if (a === "--slugs")
      args.slugs = next(++i, a).split(",").filter(Boolean);
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
          result.skipped.map((s) => s.slug + " (" + s.reason + ")").join(", ")
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
  canonicalAxes,
  canonicalizeVariants,
  parseArgs,
};
