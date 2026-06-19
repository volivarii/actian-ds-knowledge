"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { recordToMarkdown, markdownToRecord } = require("../scripts/app-context/lib");

test("entity round-trips: description ↔ body, structured fields ↔ frontmatter", () => {
  const rec = {
    _schema_version: 1,
    slug: "data-product",
    label: "Data Product",
    description: "Curated, business-ready asset. Published to marketplace.",
    properties: ["name", "status"],
    relationships: { hasInputPorts: "input-port", hasDatasets: "dataset" },
    apps: ["studio", "explorer"],
  };
  const md = recordToMarkdown(rec, {
    schemaRelPath: "../../../schemas/app-context-entity.json",
    bodyField: "description",
  });
  assert.ok(md.startsWith("---\n# yaml-language-server: $schema=../../../schemas/app-context-entity.json\n"));
  assert.ok(!md.includes("description:"), "description is NOT in frontmatter");
  assert.ok(md.includes("Curated, business-ready asset"), "description is in the body");
  const back = markdownToRecord(md, { bodyField: "description" });
  assert.deepEqual(back, rec);
});

test("app round-trips with no body (frontmatter-only)", () => {
  const rec = {
    _schema_version: 1,
    slug: "studio",
    label: "Studio",
    purpose: "Data governance and catalog management.",
    users: ["Data steward"],
    header: { type: "Studio" },
    sidebar: [{ label: "Catalog", id: "catalog" }],
    signals: ["steward", "govern"],
  };
  const md = recordToMarkdown(rec, { schemaRelPath: "../../../schemas/app-context-app.json" });
  const back = markdownToRecord(md, {});
  assert.deepEqual(back, rec);
});
