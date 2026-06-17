// Smoke test for the local-file connection extractor.
//
// parseLocalFrontmatter must produce OutgoingConnection[] entries with
// correct refType + note + domain resolution against the supplied
// taxonomy. Unknown slugs surface as `domain: null` (broken) — the
// inspector renders them with the unresolved-row treatment.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocalFrontmatter } from "../../src/substrate/parseLocalFrontmatter";
import type { Taxonomy } from "../../src/substrate/taxonomy";

const tax: Taxonomy = {
  getSlugs: () => [],
  getTitle: () => null,
  getBody: () => null,
  getTier: () => null,
  domainOfSlug: (slug) => {
    if (slug === "color-contrast") return "accessibility";
    if (slug === "state-transitions") return "motion";
    return null;
  },
  searchSections: () => [],
};

test("parseLocalFrontmatter: returns empty list when no envelope", () => {
  assert.deepEqual(parseLocalFrontmatter("# Just a heading\n", tax), []);
});

test("parseLocalFrontmatter: extracts a11y_refs with notes", () => {
  const src = [
    "---",
    "a11y_refs:",
    "  - { ref: color-contrast, note: AA on body text }",
    "---",
    "",
    "## Heading\n",
  ].join("\n");
  const out = parseLocalFrontmatter(src, tax);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.slug, "color-contrast");
  assert.equal(out[0]!.refType, "a11y_refs");
  assert.equal(out[0]!.note, "AA on body text");
  assert.equal(out[0]!.domain, "accessibility");
});

test("parseLocalFrontmatter: extracts motion_refs", () => {
  const src = [
    "---",
    "motion_refs:",
    "  - { ref: state-transitions }",
    "---",
    "",
    "body",
  ].join("\n");
  const out = parseLocalFrontmatter(src, tax);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.slug, "state-transitions");
  assert.equal(out[0]!.refType, "motion_refs");
  assert.equal(out[0]!.domain, "motion");
});

test("parseLocalFrontmatter: mixes both ref types in source order", () => {
  const src = [
    "---",
    "a11y_refs:",
    "  - { ref: color-contrast }",
    "motion_refs:",
    "  - { ref: state-transitions }",
    "---",
    "",
  ].join("\n");
  const out = parseLocalFrontmatter(src, tax);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.refType, "a11y_refs");
  assert.equal(out[1]!.refType, "motion_refs");
});

test("parseLocalFrontmatter: unknown slug surfaces as domain: null", () => {
  const src = ["---", "a11y_refs:", "  - { ref: ghost-topic }", "---", ""].join(
    "\n",
  );
  const out = parseLocalFrontmatter(src, tax);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.slug, "ghost-topic");
  assert.equal(out[0]!.domain, null);
});

// Step 1 — foundations_refs
const taxWithFoundations: Taxonomy = {
  getSlugs: () => [],
  getTitle: () => null,
  getBody: () => null,
  getTier: () => null,
  domainOfSlug: (slug) => {
    if (slug === "tokens") return "foundations";
    if (slug === "color-contrast") return "accessibility";
    return null;
  },
  searchSections: () => [],
};

test("parseLocalFrontmatter: extracts foundations_refs entries", () => {
  const src = [
    "---",
    "foundations_refs:",
    "  - { ref: tokens }",
    "---",
    "",
    "## Heading\n",
  ].join("\n");
  const out = parseLocalFrontmatter(src, taxWithFoundations);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.slug, "tokens");
  assert.equal(out[0]!.refType, "foundations_refs");
  assert.equal(out[0]!.domain, "foundations");
});

test("parseLocalFrontmatter: mixes a11y_refs and foundations_refs", () => {
  const src = [
    "---",
    "a11y_refs:",
    "  - { ref: color-contrast }",
    "foundations_refs:",
    "  - { ref: tokens }",
    "---",
    "",
  ].join("\n");
  const out = parseLocalFrontmatter(src, taxWithFoundations);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.refType, "a11y_refs");
  assert.equal(out[1]!.refType, "foundations_refs");
});

// Step 5 — relatedComponents (flat array on content files). Without read-back
// the picker is write-only: you could add a component but never see/remove it.
const taxWithComponents: Taxonomy = {
  getSlugs: () => [],
  getTitle: (domain, slug) =>
    domain === "component" && (slug === "button" || slug === "input")
      ? slug[0]!.toUpperCase() + slug.slice(1)
      : null,
  getBody: () => null,
  getTier: () => null,
  domainOfSlug: (slug) => (slug === "color-contrast" ? "accessibility" : null),
  searchSections: () => [],
};

test("parseLocalFrontmatter: extracts inline relatedComponents as component connections", () => {
  const src = [
    "---",
    "relatedComponents: [button, input]",
    "---",
    "",
    "## Section\n",
  ].join("\n");
  const out = parseLocalFrontmatter(src, taxWithComponents);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.slug, "button");
  assert.equal(out[0]!.refType, "relatedComponents");
  assert.equal(out[0]!.domain, "component");
  assert.equal(out[0]!.note, null);
  assert.equal(out[1]!.slug, "input");
  assert.equal(out[1]!.domain, "component");
});

test("parseLocalFrontmatter: unknown relatedComponents slug surfaces as domain null", () => {
  const src = ["---", "relatedComponents: [ghost-widget]", "---", ""].join(
    "\n",
  );
  const out = parseLocalFrontmatter(src, taxWithComponents);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.slug, "ghost-widget");
  assert.equal(out[0]!.refType, "relatedComponents");
  assert.equal(out[0]!.domain, null);
});

test("parseLocalFrontmatter: mixes object-refs and relatedComponents in one file", () => {
  const src = [
    "---",
    "a11y_refs:",
    "  - { ref: color-contrast }",
    "relatedComponents: [button]",
    "---",
    "",
  ].join("\n");
  const out = parseLocalFrontmatter(src, taxWithComponents);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.refType, "a11y_refs");
  assert.equal(out[0]!.domain, "accessibility");
  assert.equal(out[1]!.refType, "relatedComponents");
  assert.equal(out[1]!.domain, "component");
});
