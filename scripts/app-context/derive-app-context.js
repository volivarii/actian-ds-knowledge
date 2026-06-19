"use strict";
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { markdownToRecord, stableStringify, writeAtomic } = require("./lib");

const SCHEMA_VERSION = 1;
const META = {
  auto_generated: true,
  source: "scripts/app-context/derive-app-context.js",
  do_not_edit: true,
};

const KINDS = {
  apps: { dir: "apps", bodyField: null },
  entities: { dir: "entities", bodyField: "description" },
  patterns: { dir: "patterns", bodyField: "description" },
};

function readKind(srcDir, kind) {
  const cfg = KINDS[kind];
  const dir = path.join(srcDir, cfg.dir);
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()) {
    const slug = file.replace(/\.md$/, "");
    const rec = markdownToRecord(
      fs.readFileSync(path.join(dir, file), "utf8"),
      {
        bodyField: cfg.bodyField,
      },
    );
    if (rec.slug !== slug) {
      throw new Error(
        `${kind}/${file}: slug "${rec.slug}" != filename "${slug}"`,
      );
    }
    // Strip authoring-only keys; keep the consumer-facing shape.
    delete rec._schema_version;
    delete rec.slug;
    out[slug] = rec;
  }
  return out;
}

function readTerminology(srcDir) {
  const p = path.join(srcDir, "terminology.yml");
  if (!fs.existsSync(p)) return {};
  const doc = YAML.parse(fs.readFileSync(p, "utf8")) || {};
  return doc.terms || {};
}

function deriveToObject(srcDir) {
  return {
    _schema_version: SCHEMA_VERSION,
    _meta: META,
    apps: readKind(srcDir, "apps"),
    entities: readKind(srcDir, "entities"),
    terminology: readTerminology(srcDir),
    patterns: readKind(srcDir, "patterns"),
  };
}

function runCli(argv) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const srcDir = path.join(repoRoot, "app-context", "src");
  const distDir = path.join(repoRoot, "app-context", "dist");
  const dist = deriveToObject(srcDir);
  const { validateAppContext } = require("./validate-app-context");
  const { errors } = validateAppContext(dist);
  if (errors.length) {
    console.error("app-context integrity errors:\n" + errors.join("\n"));
    return 1;
  }
  writeAtomic(path.join(distDir, "app-context.json"), stableStringify(dist));
  writeAtomic(
    path.join(distDir, "app-context.bundle.json"),
    stableStringify({
      _schema_version: SCHEMA_VERSION,
      _meta: META,
      appContext: dist,
    }),
  );
  require("./manifest-update").updatePathsManifest(
    path.join(repoRoot, "paths-manifest.json"),
  );
  console.log("derived app-context dist");
  return 0;
}

module.exports = { deriveToObject, runCli };
