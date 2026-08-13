#!/usr/bin/env node
"use strict";

// Validates domains.json (the per-domain authoring-contract registry) — keeps
// the declaration HONEST (STEP 1 lesson: CI auto-commits dist drift, so honesty
// must live in the test gate). Four checks: schema-valid, referential
// integrity, derive coverage, and a cheap per-domain mirror cross-check.

const fs = require("node:fs");
const path = require("node:path");
const {
  createValidator,
  emitRdjsonl,
  emitSummary,
} = require("./lib-validator");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// derive:* targets that are infra, not authorable-knowledge body domains.
// render derives the canonical component render dist (HTML + CEM + DTCG +
// usage-notes) from captured seeds and tokens, a build pipeline like icons, not
// an authored MD body domain, so it carries no domains.json unit.
// llms re-projects three domains that each already carry their own unit
// (foundations, accessibility, content/global) into the root llms.txt index +
// llms-full.txt prose dump. It has no authoring surface of its own: no src/, no
// frontmatter schema, no body to parse, and no distShape in the enum fits a
// plain-text concatenation. Registering a unit for it would claim an authoring
// contract that does not exist; its freshness is asserted instead by the llms
// drift guard in validate-manifest.yml (#525).
const INFRA_DERIVES = new Set(["icons", "vendor-include", "render", "llms"]);

// Literal prefix of a glob (up to first `*` or `{`), trailing slash trimmed.
// NOTE: the referential check below only asserts this LITERAL PREFIX exists —
// it does NOT expand `*`/`{...}` segments. So it catches a typo in the literal
// part (e.g. `componnents/src/...`) but not inside a globbed segment. A full
// match-count check would need a glob engine (none is installed). Cheap by design.
function globPrefix(glob) {
  const i = glob.search(/[*{]/);
  const lit = i === -1 ? glob : glob.slice(0, i);
  return lit.replace(/\/+$/, "");
}

function deriveTargets(repoRoot) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  return Object.keys(pkg.scripts || {})
    .filter((k) => k.startsWith("derive:"))
    .map((k) => k.slice("derive:".length));
}

// Cheap per-domain verbatim-mirror existence probe (body.mirror:true). STEP 4's
// engine will generalize this; for now it's an explicit probe for the units we
// have verified emit a mirror. Units not listed here pass (not cheaply checked).
function mirrorExists(unitKey, repoRoot) {
  if (unitKey === "categories") {
    const dir = path.join(repoRoot, "components", "dist", "categories");
    return (
      fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".md"))
    );
  }
  if (unitKey === "foundations") {
    return fs.existsSync(
      path.join(repoRoot, "foundations", "dist", "foundations.md"),
    );
  }
  if (unitKey === "guidelines") {
    const dir = path.join(repoRoot, "components", "dist", "guidelines");
    if (!fs.existsSync(dir)) return false;
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "guidelines.bundle.json")
      .some((f) => {
        let j;
        try {
          j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        } catch (_e) {
          return false; // corrupt dist json → not a valid mirror (caught, not thrown)
        }
        return Object.values(j.domains || {}).some(
          (d) => typeof d.markdown === "string" && d.markdown.length > 0,
        );
      });
  }
  if (unitKey === "content/global") {
    return fs.existsSync(path.join(repoRoot, "content", "dist", "global.md"));
  }
  return true; // any other mirror:true unit is not cheaply probed in this slice
}

function collectViolations(opts = {}) {
  const repoRoot = opts.repoRoot || REPO_ROOT;
  const registry =
    opts.registry ||
    JSON.parse(fs.readFileSync(path.join(repoRoot, "domains.json"), "utf8"));
  const violations = [];

  // 1. Schema-valid. If malformed, bail (structural checks below assume shape).
  const validate = createValidator("domains.json");
  if (!validate(registry)) {
    for (const err of validate.errors || []) {
      violations.push(
        "schema: " + err.message + " at " + (err.instancePath || "(root)"),
      );
    }
    return violations;
  }

  const units = registry.domains;

  // 2. Referential integrity.
  for (const [key, u] of Object.entries(units)) {
    if (
      u.frontmatterSchema &&
      !fs.existsSync(path.join(repoRoot, u.frontmatterSchema))
    ) {
      violations.push(
        key + ": frontmatterSchema not found: " + u.frontmatterSchema,
      );
    }
    if (u.generator && !fs.existsSync(path.join(repoRoot, u.generator))) {
      violations.push(key + ": generator not found: " + u.generator);
    }
    if (u.src) {
      const prefix = globPrefix(u.src);
      if (!fs.existsSync(path.join(repoRoot, prefix))) {
        violations.push(
          key + ": src path not found: " + u.src + " (prefix " + prefix + ")",
        );
      }
    }
  }

  // 3. Coverage: every non-infra derive:* target maps to >=1 unit.
  // CAVEAT: answers "does each derive TARGET map to a unit", not "is every
  // generator script represented". A target may chain scripts — e.g.
  // `derive:accessibility` runs derive-a11y-index.js && derive-a11y-sections.js
  // but only the latter is the registered unit generator (the index is a derived
  // lookup, not a body domain). Accepted limitation.
  const unitKeys = Object.keys(units);
  for (const t of deriveTargets(repoRoot)) {
    if (INFRA_DERIVES.has(t)) continue;
    const covered = unitKeys.some((k) => k === t || k.startsWith(t + "/"));
    if (!covered) {
      violations.push("coverage: derive:" + t + " has no domains.json unit");
    }
  }

  // 4. Cheap mirror cross-check.
  for (const [key, u] of Object.entries(units)) {
    if (u.body && u.body.mirror === true && !mirrorExists(key, repoRoot)) {
      violations.push(
        key + ": body.mirror:true but no verbatim mirror found in dist",
      );
    }
  }

  return violations;
}

function main() {
  const violations = collectViolations();
  for (const v of violations) {
    emitRdjsonl({
      message: v,
      location: {
        path: "domains.json",
        range: { start: { line: 1, column: 1 } },
      },
      severity: "ERROR",
    });
  }
  emitSummary(
    "[validate-domains] " +
      (violations.length === 0 ? "OK" : violations.length + " violation(s)"),
  );
  process.exit(violations.length === 0 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { collectViolations, globPrefix };
