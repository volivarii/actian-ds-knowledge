"use strict";
// ONE-TIME migration: app-context/app-context.json → per-record src files.
// apps/entities/patterns → <slug>.md ; terminology → terminology.yml.
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { recordToMarkdown, writeAtomic } = require("./lib");

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = JSON.parse(fs.readFileSync(path.join(ROOT, "app-context", "app-context.json"), "utf8"));
const OUT = path.join(ROOT, "app-context", "src");

// kind → { dir, schemaRel, bodyField }
const KINDS = {
  apps: { dir: "apps", schemaRel: "../../../schemas/app-context-app.json", bodyField: null },
  entities: { dir: "entities", schemaRel: "../../../schemas/app-context-entity.json", bodyField: "description" },
  patterns: { dir: "patterns", schemaRel: "../../../schemas/app-context-pattern.json", bodyField: "description" },
};

for (const kind of Object.keys(KINDS)) {
  const cfg = KINDS[kind];
  const map = SRC[kind] || {};
  for (const slug of Object.keys(map)) {
    const record = Object.assign({ _schema_version: 1, slug }, map[slug]);
    const md = recordToMarkdown(record, { schemaRelPath: cfg.schemaRel, bodyField: cfg.bodyField });
    writeAtomic(path.join(OUT, cfg.dir, `${slug}.md`), md);
  }
  console.log(`${kind}: wrote ${Object.keys(map).length} files`);
}

// terminology → single YAML file (a slug-keyed map, each row { use, meaning, notUse }).
writeAtomic(
  path.join(OUT, "terminology.yml"),
  "# yaml-language-server: $schema=../../schemas/app-context-term.json\n" +
    YAML.stringify({ _schema_version: 1, terms: SRC.terminology || {} }),
);
console.log(`terminology: wrote ${Object.keys(SRC.terminology || {}).length} terms`);
