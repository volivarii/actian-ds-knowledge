"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const dsMap = require(
  path.join(
    REPO_ROOT,
    "components/render/renderer/html-renderers/ds-html-map.js",
  ),
);
const matrix = require(
  path.join(REPO_ROOT, "components/render/renderer/matrix.js"),
);

dsMap.setIcons(
  require(path.join(REPO_ROOT, "components/dist/icons/icons.json")),
);
try {
  dsMap.setGraphics(
    require(path.join(REPO_ROOT, "components/dist/graphics/graphics.json")),
  );
} catch (e) {}

function firstCellText(slug) {
  const cell = matrix.variantMatrix(slug)[0];
  const html = dsMap.renderDSComponent({
    dsSlug: slug,
    variant: cell.variant,
    props: cell.props || {},
  });
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Each expectation is the string the Figma capture holds for that slot, so a
// reviewer can check it against the design file rather than against taste.
const CAPTURED = [
  ["card-for-items", "Body goes here. Lorem ipsum"],
  ["lineage-individual-node", "PB"],
  ["lineage-grouped-node", "DS"],
  ["metamodel-widget", "DS"],
  ["notification", "Item deleted"],
  ["stepper", "Complete"],
  ["tooltip", "Body line text lorem ipsum"],
];

CAPTURED.forEach(function (pair) {
  test("renders the captured content for " + pair[0], function () {
    assert.match(
      firstCellText(pair[0]),
      new RegExp(pair[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      pair[0] + " must render its captured text, not an empty slot",
    );
  });
});

test("chat-with-ai-steward renders an authored insight", function () {
  const text = firstCellText("chat-with-ai-steward");
  assert.ok(text.length > 0, "chat-with-ai-steward renders no text at all");
  assert.match(
    text,
    /lineage/i,
    "the authored insight mentions the asset it describes",
  );
});

// The State=Complete matrix cell (the one firstCellText reads) takes the
// check-icon branch and never evaluates the Step fallback, so that fallback
// needs its own non-complete cell to be exercised at all. Anchored on the
// status element's own class, not a bare "1" in the full text, so this
// cannot pass by matching an unrelated digit elsewhere in the markup.
test("stepper renders the captured Step fallback on a non-complete cell", function () {
  const html = dsMap.renderDSComponent({
    dsSlug: "stepper",
    variant: "State=Active",
    props: {},
  });
  assert.match(
    String(html),
    /<span class="ds-stepper__status">1<\/span>/,
    "stepper must render its captured Step fallback in the status element on a non-complete cell",
  );
});
