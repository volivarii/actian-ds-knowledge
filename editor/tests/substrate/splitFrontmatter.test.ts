import test from "node:test";
import assert from "node:assert/strict";
import {
  splitFrontmatter,
  classifyFrontmatter,
  routeNoFrontmatter,
} from "../../src/substrate/splitFrontmatter";

test("splits a fenced file into data, body, frontmatterText", () => {
  const src = "---\nslug: action\nlabel: Action\n---\n\n# Body\ntext\n";
  const r = splitFrontmatter(src);
  assert.deepEqual(r.data, { slug: "action", label: "Action" });
  assert.equal(r.body, "\n# Body\ntext\n");
  assert.equal(r.frontmatterText, "slug: action\nlabel: Action");
});

test("returns null data + whole input as body when no frontmatter", () => {
  const r = splitFrontmatter("# Just a heading\n");
  assert.equal(r.data, null);
  assert.equal(r.body, "# Just a heading\n");
  assert.equal(r.frontmatterText, null);
});

test("returns null data (tolerant) when frontmatter YAML is malformed", () => {
  // ': :' is invalid YAML inside the fence
  const src = "---\nslug: action\n: : bad\n---\nbody\n";
  const r = splitFrontmatter(src);
  assert.equal(r.data, null);
  assert.equal(r.body, src);
});

test("classifyFrontmatter: a parseable fenced file is 'form'", () => {
  assert.equal(classifyFrontmatter("---\nslug: action\n---\n\nbody\n"), "form");
});

test("classifyFrontmatter: a file with NO fence is 'no-frontmatter'", () => {
  assert.equal(
    classifyFrontmatter("# Just a heading\n\nProse.\n"),
    "no-frontmatter",
  );
  assert.equal(classifyFrontmatter(""), "no-frontmatter");
  // leading blank lines then prose (no fence) is still no-frontmatter
  assert.equal(classifyFrontmatter("\n\nProse only.\n"), "no-frontmatter");
});

test("routeNoFrontmatter: a no-fence file is silent for optional-frontmatter (prose) domains", () => {
  const noFence = "# Just a heading\n\nProse.\n";
  // content / foundations treat frontmatter as OPTIONAL → open silently.
  assert.equal(routeNoFrontmatter(noFence, true), "no-frontmatter");
});

test("routeNoFrontmatter: a no-fence file WARNS for required-frontmatter (record) domains", () => {
  const noFence = "# Just a heading\n\nProse.\n";
  // app-context / categories / words-to-avoid REQUIRE frontmatter → warn + raw.
  assert.equal(routeNoFrontmatter(noFence, false), "raw");
});

test("routeNoFrontmatter: a malformed fence always warns (both domain kinds)", () => {
  const broken = "---\nslug: action\n: : bad\n---\nbody\n";
  assert.equal(routeNoFrontmatter(broken, true), "raw");
  assert.equal(routeNoFrontmatter(broken, false), "raw");
});

test("classifyFrontmatter: a broken fence is 'malformed'", () => {
  // opens a fence but the YAML inside does not parse
  assert.equal(
    classifyFrontmatter("---\nslug: action\n: : bad\n---\nbody\n"),
    "malformed",
  );
  // opens a fence that never closes
  assert.equal(
    classifyFrontmatter("---\nslug: action\nno closing fence\n"),
    "malformed",
  );
  // leading whitespace before the fence still reads as an intended (malformed) fence
  assert.equal(classifyFrontmatter("\n---\nslug: action\n---\n"), "malformed");
});
