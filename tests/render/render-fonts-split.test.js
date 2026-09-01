"use strict";

// Gate: the embedded font faces are their own artifact, not 70% of the
// component stylesheet.
//
// render.css was 478 KB, of which 336 KB was six base64 woff2 subsets. That is
// what broke the 256 KiB card cap and what would make a docs preview download
// the whole type library to show one button. Splitting the sheet PER COMPONENT
// would not have touched it: every per-component sheet would still have carried
// the fonts, so the total would have grown.
//
// The offline contract ("NO network font loads") is not dropped, it is made
// opt-in: a consumer that needs standalone files inlines both artifacts, and
// build-bundle.js does exactly that.

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const { deriveCanonical } = require(
  path.join(REPO_ROOT, "scripts", "render", "derive-canonical.js"),
);

const DATA_URI = /url\(\s*data:font/i;

test("render.css carries no embedded font payload", function () {
  const out = deriveCanonical();

  assert.ok(
    !DATA_URI.test(out.css),
    "render.css must not embed base64 font data; it belongs in the fonts artifact",
  );
  assert.ok(
    Buffer.byteLength(out.css) < 256 * 1024,
    "render.css must fit under the 256 KiB card cap on its own, got " +
      Math.round(Buffer.byteLength(out.css) / 1024) +
      " KB",
  );
});

test("the fonts artifact carries the faces, so nothing is lost", function () {
  // Non-vacuity: a split that dropped the payload instead of moving it would
  // satisfy the test above and silently unstyle every offline card.
  const out = deriveCanonical();

  assert.ok(DATA_URI.test(out.fontsCss), "the fonts artifact embeds the faces");
  assert.match(out.fontsCss, /@font-face/, "carries @font-face rules");
  assert.ok(
    Buffer.byteLength(out.fontsCss) > 100 * 1024,
    "the payload moved rather than shrank, got " +
      Math.round(Buffer.byteLength(out.fontsCss) / 1024) +
      " KB",
  );
});

test("the two artifacts together are what the single sheet was", function () {
  // The split must be a partition, not a rewrite: every byte still ships, so a
  // consumer inlining both is byte-for-byte where it was before.
  const fs = require("node:fs");
  const out = deriveCanonical();
  // Counted from the SOURCE rather than pinned to a literal. A literal would
  // fail on a legitimate change (adding Roboto 300) with a message claiming the
  // payload had gone missing, which is a gate that reds on the work it should
  // permit.
  const source = fs.readFileSync(
    path.join(REPO_ROOT, "components/render/renderer/ds-fonts.css"),
    "utf8",
  );
  const expected = (source.match(/@font-face/g) || []).length;
  const faces = (out.fontsCss.match(/@font-face/g) || []).length;

  assert.ok(expected > 0, "the source declares faces at all (non-vacuity)");
  assert.strictEqual(
    faces,
    expected,
    "every face in ds-fonts.css reaches the fonts artifact",
  );
  assert.ok(
    !/@font-face/.test(out.css),
    "and none is left behind in the component sheet",
  );
});

test("a standalone bundle card still embeds its fonts", function () {
  // The offline contract survives the split only if the consumer that needs it
  // inlines both artifacts. If this regresses, every standalone card renders in
  // a fallback face and nothing fails: the card is still valid HTML, still
  // passes its structural checks, and is simply wrong to look at.
  const bundle = require(
    path.join(REPO_ROOT, "scripts", "render", "build-bundle.js"),
  );
  const out = deriveCanonical();
  const card = bundle.selfContainedCard(
    out.css,
    out.fontsCss,
    out.pageCss,
    "<div>x</div>",
    "form",
  );

  assert.ok(DATA_URI.test(card), "the card embeds the font payload");
  assert.ok(card.indexOf(out.css) >= 0, "and still carries the component CSS");
});

test("the render manifest names the fonts artifact", function () {
  // Without this, a derive that silently stopped emitting the field would red no
  // check, and a consumer resolving the artifact through the manifest would have
  // no way to find it.
  const out = deriveCanonical();

  assert.strictEqual(out.manifest.fontsCss, "render-fonts.css");
  assert.strictEqual(out.manifest.css, "render.css");
  assert.match(
    out.manifest.schemaVersion,
    /^1\.1\./,
    "the envelope version moved when the envelope gained a key",
  );
});
