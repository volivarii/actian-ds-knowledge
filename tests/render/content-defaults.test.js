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

// Conditional-omit slots: the element is absent entirely when the prop is unset,
// so these assert the rendered text, not just a non-empty element.
// input-date's helper slot is NOT covered here: "MM/DD/YYYY" also appears in
// datePlaceholder's own unconditional literal elsewhere in the same case block,
// so a stripped-text match on that string would pass whether or not the helper
// slot itself was filled. See the raw-HTML-anchored test below instead.
const RESOLVED = [
  ["radio", "Description"],
  ["toggle", "Description"],
  ["page-header", "Support text"],
  ["modal", "Update the description"],
  ["dropdown-select-default", "A description helps users"],
  ["popover", "Interaction guide"],
  ["account-dropdown", "account.user@example.com"],
];

RESOLVED.forEach(function (pair) {
  test("renders resolved content for " + pair[0], function () {
    assert.match(
      firstCellText(pair[0]),
      new RegExp(pair[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      pair[0] + " must render its slot rather than omitting the element",
    );
  });
});

test("account-dropdown does not ship the captured personal address", function () {
  const text = firstCellText("account-dropdown");
  assert.doesNotMatch(
    text,
    /hcl-software\.com/,
    "the Figma capture holds a real-looking personal address; it must not ship as specimen content",
  );
});

test("stepper renders its captured body", function () {
  assert.match(firstCellText("stepper"), /Optional body/);
});

test("notification renders its captured action label", function () {
  assert.match(firstCellText("notification"), /Close/);
});

// Fix round 1: three conditional-omit fills had no assertion that would fail
// if the fill were reverted, because a stripped-text match on the resolved
// string can be satisfied by an identical (or coincidentally overlapping)
// substring rendered elsewhere in the same component. These assert against
// the raw HTML, anchored to the specific element's own class, so a match
// elsewhere in the markup cannot satisfy them.
function firstCellHtml(slug) {
  const cell = matrix.variantMatrix(slug)[0];
  return String(
    dsMap.renderDSComponent({
      dsSlug: slug,
      variant: cell.variant,
      props: cell.props || {},
    }),
  );
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("input-date renders its resolved helper text in the helper element", function () {
  assert.match(
    firstCellHtml("input-date"),
    new RegExp(
      '<span class="ds-input-date__helper">' +
        escapeRegExp("Use MM/DD/YYYY.") +
        "</span>",
    ),
    "input-date must render its helper slot rather than omitting the element",
  );
});

test("dropdown-select-default renders its resolved helper text in the helper element", function () {
  assert.match(
    firstCellHtml("dropdown-select-default"),
    new RegExp(
      '<span class="ds-dropdown-select__helper">' +
        escapeRegExp("Helper text goes here") +
        "</span>",
    ),
    "dropdown-select-default must render its helper slot rather than omitting the element",
  );
});

test("popover renders its full resolved body text in the body element", function () {
  const body =
    "Explore this asset’s upstream sources and downstream consumers, as well as the transformations connecting them across the data pipeline. Learn how to navigate data lineage using mouse and keyboard controls.";
  assert.match(
    firstCellHtml("popover"),
    new RegExp(
      '<span class="ds-popover__body">' + escapeRegExp(body) + "</span>",
    ),
    "popover must render its full captured body text (both sentences) in its own element",
  );
});

test("modal renders its captured footer actions", function () {
  const text = firstCellText("modal");
  assert.match(text, /Cancel/, "modal must render its captured Cancel action");
  assert.match(
    text,
    /Confirm/,
    "modal must render its captured Confirm action",
  );
});

test("table renders body rows matching its column defaults", function () {
  const text = firstCellText("table");
  assert.match(text, /Name/, "the default columns still render");
  assert.match(
    text,
    /customer_orders/,
    "the table must render body rows, not an empty tbody",
  );
});

test("chat-with-ai-steward renders a context chip", function () {
  assert.match(firstCellText("chat-with-ai-steward"), /Dataset/);
});

test("each alert Type cell carries its own message", function () {
  const cells = matrix.variantMatrix("alert-banner");
  const messages = cells.map(function (c) {
    return (c.props || {}).Message;
  });
  assert.deepEqual(
    messages,
    ["Info", "Success", "Warning", "Error"],
    "four cells sharing one message render four identical alerts",
  );
  const rendered = cells.map(function (c) {
    return dsMap.renderDSComponent({
      dsSlug: "alert-banner",
      variant: c.variant,
      props: c.props,
    });
  });
  assert.equal(
    new Set(rendered).size,
    4,
    "the four alert cells must not render identical markup",
  );
});
