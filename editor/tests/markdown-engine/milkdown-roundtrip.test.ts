import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { roundTripMarkdown } from "../../src/markdown-engine/milkdownPreset";

const require = createRequire(import.meta.url);
// splitFrontmatter returns { data, body } — data is already YAML-parsed
const {
  splitFrontmatter,
  parseBodySections,
} = require("../../../scripts/app-context/lib-pure");
const {
  assembleAppRecord,
  deriveFieldRecord,
} = require("../../../scripts/app-context/derive-app-context");
import { assembleFrontmatterFile } from "../../src/app/FrontmatterBodyEditScreen";

const SRC_DIR = new URL("../../../app-context/src/", import.meta.url).pathname;
const APPS_DIR = SRC_DIR + "apps/";

// Derive helpers mirroring derive-app-context.js exactly (the two modes that
// consume a Milkdown-edited body).
//  - "sections" mode (apps): body → parseBodySections → prose/bullets
//  - "field" mode (entities/patterns): body stored VERBATIM as `description`
function deriveSections(fm: Record<string, unknown>, body: string) {
  return assembleAppRecord(fm, parseBodySections(body));
}
function deriveField(body: string) {
  return deriveFieldRecord(`---\nslug: fixture\n---\n${body}\n`, "description");
}

test("every app-context app body derives identically after a Milkdown round-trip", async () => {
  const files = readdirSync(APPS_DIR).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 1, "expected at least one app fixture");
  for (const f of files) {
    const raw = readFileSync(APPS_DIR + f, "utf8");
    // splitFrontmatter returns { data (already parsed), body }
    const { data: fm, body } = splitFrontmatter(raw);
    const original = assembleAppRecord(fm, parseBodySections(body));
    const roundtripped = assembleAppRecord(
      fm,
      parseBodySections(await roundTripMarkdown(body)),
    );
    assert.deepEqual(roundtripped, original, `dist drift for ${f}`);
  }
});

// Entities and patterns store the body VERBATIM as `description` (field mode).
// Any serializer rewrite of the body leaks straight into the dist — lock it.
for (const kind of ["entities", "patterns"] as const) {
  test(`every ${kind} description derives identically after a Milkdown round-trip`, async () => {
    const dir = SRC_DIR + kind + "/";
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    assert.ok(files.length >= 1, `expected at least one ${kind} fixture`);
    for (const f of files) {
      const { body } = splitFrontmatter(readFileSync(dir + f, "utf8"));
      const original = deriveField(body);
      const roundtripped = deriveField(await roundTripMarkdown(body));
      assert.deepEqual(roundtripped, original, `${kind} dist drift for ${f}`);
    }
  });
}

// Adversarial fixtures: markdown-special characters that the CommonMark
// serializer defensively backslash-escapes (`data_product` → `data\_product`,
// `2*3` → `2\*3`). Real fixtures happen to be free of these today, so they
// can't catch the regression — these inline cases do.
test("app sections survive a Milkdown round-trip with snake_case / * prose and bullets", async () => {
  const fm = { label: "Fixture", header: { type: "studio" }, sidebar: [] };
  const body = [
    "## Purpose",
    "Manage data_product pipelines and apply 2*3 scaling with a_b_c keys",
    "",
    "## Users",
    "- data_engineer",
    "- ops*lead",
    "",
    "## Signals",
    "- pipeline_failure",
    "- cost*spike",
  ].join("\n");
  const original = deriveSections(fm, body);
  const roundtripped = deriveSections(fm, await roundTripMarkdown(body));
  assert.deepEqual(roundtripped, original);
  // Guard against the test passing vacuously — the special chars must survive.
  assert.equal(
    roundtripped.purpose,
    "Manage data_product pipelines and apply 2*3 scaling with a_b_c keys",
  );
  assert.deepEqual(roundtripped.signals, ["pipeline_failure", "cost*spike"]);
});

test("verbatim description survives a Milkdown round-trip with snake_case / * text", async () => {
  const body =
    "Consumer request for data_product access with cost*benefit and a_b_c metadata";
  const original = deriveField(body);
  const roundtripped = deriveField(await roundTripMarkdown(body));
  assert.deepEqual(roundtripped, original);
  assert.equal(roundtripped.description, body);
});

// The REAL editor save path for a file that HAS a blank line after the
// frontmatter fence (`---\n<fm>---\n\n<body>`, 10 of the repo's 97): the screen
// restores that blank line after the rich editor's round trip, so for
// field-mode records the verbatim `description` still arrives with a leading
// newline, and the derive must absorb it or the dist drifts on the first save.
// The assembler itself adds none (sub-task 1114), so the fixture states it.
function deriveFieldViaSave(body: string) {
  const file = assembleFrontmatterFile({ slug: "fixture" }, null, "\n" + body);
  return deriveFieldRecord(file, "description");
}

test("field description survives the real editor save→derive cycle (no leading-newline drift)", () => {
  const body = "Consumer request for data_product access";
  assert.equal(deriveFieldViaSave(body).description, body);
});

test("field description survives editor save→derive after a Milkdown round-trip", async () => {
  const body = "Consumer request for data_product access with cost*benefit";
  assert.equal(
    deriveFieldViaSave(await roundTripMarkdown(body)).description,
    body,
  );
});

// Coverage for markdown constructs the real fixtures don't contain (so the
// "every fixture" tests pass vacuously for them). These lock what the WYSIWYG
// round-trip preserves today — a regression in any is a real dist-drift bug.
test("verbatim description round-trips a markdown link with _ in the URL", async () => {
  const body =
    "See [the docs](https://x.example/data_product/guide) for details";
  assert.equal(
    deriveField(await roundTripMarkdown(body)).description,
    deriveField(body).description,
  );
});

test("verbatim description round-trips an inline code span with _ and *", async () => {
  const body = "Use the `data_product` and `a*b` identifiers verbatim";
  const rt = deriveField(await roundTripMarkdown(body)).description;
  assert.equal(rt, deriveField(body).description);
  // The code span must survive — and NOT be unescaped away inside the backticks.
  assert.match(rt, /`data_product`/);
});

test("verbatim description round-trips a <Media> directive with _ in the src", async () => {
  const body = 'Intro <Media src="x_y.png" alt="a diagram" /> outro';
  assert.equal(
    deriveField(await roundTripMarkdown(body)).description,
    deriveField(body).description,
  );
});

// KNOWN LIMITATION (alpha): the CommonMark round-trip does NOT preserve inline
// HTML — Milkdown drops void/unknown tags. App-context bodies are prose with no
// inline HTML (verified zero in app-context/src), so this is latent today. This
// test documents the behavior and is a ROLLOUT GATE: WYSIWYG must not be enabled
// for any domain whose bodies carry raw inline HTML until this is solved.
test("KNOWN LIMITATION: inline HTML (<br>) is dropped on the WYSIWYG round-trip", async () => {
  const rt = await roundTripMarkdown("Line with a <br> void tag");
  assert.ok(
    !rt.includes("<br>"),
    "inline HTML does not survive the round-trip",
  );
});
