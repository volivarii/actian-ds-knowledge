"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  recordToMarkdown,
  markdownToRecord,
  splitFrontmatter,
  parseBodySections,
  sectionProse,
  sectionBullets,
} = require("../scripts/app-context/lib");

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
  assert.ok(
    md.startsWith(
      "---\n# yaml-language-server: $schema=../../../schemas/app-context-entity.json\n",
    ),
  );
  assert.ok(!md.includes("description:"), "description is NOT in frontmatter");
  assert.ok(
    md.includes("Curated, business-ready asset"),
    "description is in the body",
  );
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
  const md = recordToMarkdown(rec, {
    schemaRelPath: "../../../schemas/app-context-app.json",
  });
  const back = markdownToRecord(md, {});
  assert.deepEqual(back, rec);
});

test("entity round-trips a multi-line description with a trailing newline", () => {
  const rec = {
    _schema_version: 1,
    slug: "x",
    label: "X",
    description: "Line one.\n\nLine two.\n",
    properties: [],
    relationships: {},
    apps: [],
  };
  const md = recordToMarkdown(rec, {
    schemaRelPath: "../../../schemas/app-context-entity.json",
    bodyField: "description",
  });
  const back = markdownToRecord(md, { bodyField: "description" });
  assert.deepEqual(back, rec);
});

test("splitFrontmatter separates frontmatter data from body", () => {
  const text = "---\nslug: x\nlabel: X\n---\n\n## Purpose\n\nHello world\n";
  const { data, body } = splitFrontmatter(text);
  assert.equal(data.slug, "x");
  assert.equal(data.label, "X");
  assert.equal(body, "\n## Purpose\n\nHello world");
});

test("splitFrontmatter throws when no frontmatter block", () => {
  assert.throws(
    () => splitFrontmatter("no frontmatter here"),
    /no frontmatter block/,
  );
});

test("parseBodySections splits on H2 and trims blank lines", () => {
  const body = "\n## Purpose\n\nA paragraph\n\n## Users\n\n- Alice\n- Bob\n";
  const sections = parseBodySections(body);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].title, "Purpose");
  assert.deepEqual(sections[0].lines, ["A paragraph"]);
  assert.equal(sections[1].title, "Users");
  assert.deepEqual(sections[1].lines, ["- Alice", "- Bob"]);
});

test("sectionProse joins non-blank lines with single spaces", () => {
  assert.equal(
    sectionProse(["Data governance,", "catalog management"]),
    "Data governance, catalog management",
  );
  assert.equal(sectionProse(["one line"]), "one line");
});

test("sectionBullets strips list markers and trims", () => {
  assert.deepEqual(
    sectionBullets(["- Data steward", "- glossary admin", "ignored"]),
    ["Data steward", "glossary admin"],
  );
});
