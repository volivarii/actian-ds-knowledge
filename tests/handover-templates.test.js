"use strict";
// The handover templates engineering receives (knowledge-first simplification,
// contract of 2026-09-29): app-context/src/handover/intent.md (the PM's intent)
// and specs.md (the designer's specs). The plugin's check-handover.js reads each
// template's frontmatter, so the frontmatter and the body must list the same
// sections, in the same order, both ways.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "app-context/src/handover");

function load(kind) {
  const t = fs.readFileSync(path.join(DIR, kind + ".md"), "utf8");
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(t);
  assert.ok(m, kind + ".md has no frontmatter block");
  return { fm: YAML.parse(m[1]), body: m[2] };
}

for (const kind of ["intent", "specs"]) {
  test(kind + ": frontmatter and body list the same sections, in order", () => {
    const { fm, body } = load(kind);
    assert.equal(fm._schema_version, 1);
    assert.equal(fm.kind, kind);
    const heads = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    assert.deepEqual(heads, fm.sections.map((s) => s.title));
  });
  test(kind + ": every section names an owner (pm, ux or designer) and whether it is required", () => {
    for (const s of load(kind).fm.sections) {
      assert.ok(["pm", "ux", "designer"].includes(s.owner), s.title);
      assert.equal(typeof s.required, "boolean", s.title);
    }
  });
}

test("intent: every PM section's placeholder is the gap marker", () => {
  const { fm, body } = load("intent");
  assert.equal(fm.gapMarker, "To fill by PM");
  const pm = fm.sections.filter((x) => x.owner === "pm");
  assert.ok(pm.length > 0, "intent has PM sections");
  for (const s of pm) {
    const after = body.split("## " + s.title + "\n")[1];
    assert.ok(after && after.trim().startsWith(fm.gapMarker), s.title);
  }
});

test("intent adds Design decisions and Open questions; specs adds Flagged concerns", () => {
  const titles = (k) => load(k).fm.sections.map((s) => s.title);
  assert.ok(titles("intent").includes("Design decisions"));
  assert.ok(titles("intent").includes("Open questions"));
  assert.ok(titles("specs").includes("Flagged concerns"));
});

test("intent's header links the design proposal; specs' header names the knowledge version, Figma, prototype and intent, in the contract's order", () => {
  assert.match(load("intent").body, /^\*\*Design proposal:\*\* /m);
  const order = [...load("specs").body.matchAll(/^\*\*(Knowledge|Figma|Prototype|Intent):\*\* /gm)].map((m) => m[1]);
  assert.deepEqual(order, ["Knowledge", "Figma", "Prototype", "Intent"]);
});

// The contract's grammar, exactly: a filled specs.md is checked against it, and
// a filled file starts as a copy of this template.
test("specs: every section's first line names its source in the contract's words", () => {
  const { body } = load("specs");
  const sections = body.split(/^## .+$/m).slice(1);
  assert.ok(sections.length > 0);
  for (const s of sections) {
    assert.match(s.trim().split("\n")[0], /^Source: (Figma|Prototype|Intent)( \+ (Figma|Prototype|Intent))*$/);
  }
});

// app-context/src/handover ships to consumers as source with no derive, so only
// the vendored-source bump can tag a change to it. Without the trigger, an edit
// to a template reaches nobody.
test("a change to the templates bumps the version", () => {
  const wf = YAML.parse(fs.readFileSync(path.join(ROOT, ".github/workflows/vendored-source-bump.yml"), "utf8"));
  assert.ok(wf.on.pull_request.paths.includes("app-context/src/handover/**"));
});

// The appContext* manifest block is written by scripts/app-context/manifest-update.js
// (run by every app-context derive), so the handover collection must come from
// that generator: a hand-added entry is rewritten by the derive on the PR, which
// then commits the manifest and bumps a second time. Run on a copy, compared byte
// for byte, because the writer also orders keys.
test("the committed manifest is what the app-context manifest generator writes", () => {
  const os = require("os");
  const { updatePathsManifest } = require("../scripts/app-context/manifest-update.js");
  const file = path.join(ROOT, "paths-manifest.json");
  const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "manifest-")), "paths-manifest.json");
  fs.copyFileSync(file, copy);
  const { manifest } = updatePathsManifest(copy);
  assert.ok(manifest.collections.appContextHandover, "the generator writes the handover collection");
  assert.equal(fs.readFileSync(copy, "utf8"), fs.readFileSync(file, "utf8"));
});

// The plugin reads the frontmatter LINE BY LINE, not as YAML
// (check-handover.js, assemble-intent.js): each section is one line in this
// exact shape, and the title is taken verbatim up to the comma, so a quoted
// title would be looked for as a heading WITH its quotes and reported missing.
// The regex is the consumer's, quoted from its 2026-09-29 source.
const CONSUMER_LINE = /^\s*-\s*\{\s*title:\s*(.+?),\s*owner:\s*(\w+),\s*required:\s*(true|false)\s*\}/;
for (const kind of ["intent", "specs"]) {
  test(kind + ": every section line reads as the plugin's line reader reads it", () => {
    const src = fs.readFileSync(path.join(ROOT, "app-context/src/handover", kind + ".md"), "utf8");
    const front = src.split("\n---\n")[0];
    const read = front.split("\n").map((l) => CONSUMER_LINE.exec(l)).filter(Boolean).map((m) => m[1].trim());
    assert.deepEqual(read, load(kind).fm.sections.map((s) => s.title));
  });
}
