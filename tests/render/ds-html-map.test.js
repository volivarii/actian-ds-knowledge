"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

var DS_PATH = "../../components/render/renderer/html-renderers/ds-html-map.js";

test("digram-item-types: known color, no token, renders initials", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    // Size=SM, the value the registry publishes as this axis's default. It read
    // "Size=Default" until Figma renamed the axis to XS/SM/MD, which is the same
    // staleness the renderer had: a test that names a retired value proves
    // nothing about the component people actually get.
    variant: "Item type=Dataset, Size=SM",
    props: { Initials: "DS" },
  });
  assert.match(html, /class="ds-item-type"/, "carries the base class");
  assert.match(
    html,
    /background:#cfeafd/,
    "Dataset's captured color, no token",
  );
  assert.match(html, />DS</, "renders the initials");
});

test("digram-item-types: known color WITH a captured token, uses var() with fallback", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    variant: "Item type=Field, Size=Default",
    props: { Initials: "FL" },
  });
  assert.match(
    html,
    /background:var\(--zen-color-success-50, #d3efcd\)/,
    "Field carries its captured token with the hex fallback",
  );
});

test("digram-item-types: unmapped Item type falls back to the Category default", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    variant: "Item type=Custom 1, Size=Default",
    props: { Initials: "C1" },
  });
  assert.match(
    html,
    /background:#ffdacf/,
    "Custom 1 has no captured entry, falls back to Category's color",
  );
});

test("digram-item-types: Size becomes a modifier class", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    variant: "Item type=Dataset, Size=Small",
    props: { Initials: "DS" },
  });
  assert.match(
    html,
    /ds-item-type ds-item-type--small/,
    "Size lowercases into a modifier class",
  );
});

test("digram-item-types: escapes hostile Initials", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    variant: "Item type=Dataset, Size=Default",
    props: { Initials: "<img src=x onerror=1>" },
  });
  assert.match(html, /&lt;img/, "initials escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("digram-topic: known Type, renders its color and initials", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-topic",
    variant: "Type=Dark blue",
    props: { Initials: "TP" },
  });
  assert.match(html, /class="ds-topic"/, "carries the base class");
  assert.match(html, /background:#003786/, "Dark blue's captured color");
  assert.match(html, />TP</, "renders the initials");
});

test("digram-topic: default Type (Light purple) when variant omits Type", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-topic",
    variant: "",
    props: { Initials: "LP" },
  });
  assert.match(
    html,
    /background:#a17ab6/,
    "falls back to Light purple's color",
  );
});

test("digram-topic: escapes hostile Initials", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-topic",
    variant: "Type=Red",
    props: { Initials: "<svg onload=1>" },
  });
  assert.match(html, /&lt;svg/, "initials escaped");
  assert.doesNotMatch(html, /<svg onload/, "no raw injection");
});

test("lineage-individual-node: default state, renders label and badge", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "lineage-individual-node",
    variant: "Type=Main item, State=Default, Fields=Collapsed",
    props: { Label: "customer_orders", "Item type initials": "DS" },
  });
  assert.match(
    html,
    /class="ds-lineage-node"/,
    "carries the base class, no modifiers",
  );
  assert.doesNotMatch(
    html,
    /ds-lineage-node--selected/,
    "not selected by default",
  );
  assert.match(html, /class="ds-item-type"/, "inlines the item-type badge");
  assert.match(html, />customer_orders</, "renders the label");
});

test("lineage-individual-node: State=Selected adds the selected modifier", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "lineage-individual-node",
    variant: "Type=Main item, State=Selected, Fields=Collapsed",
    props: { Label: "orders" },
  });
  assert.match(
    html,
    /ds-lineage-node ds-lineage-node--selected/,
    "has the selected modifier",
  );
});

test("lineage-individual-node: Type=Sub item adds the sub modifier", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "lineage-individual-node",
    variant: "Type=Sub item, State=Default, Fields=Collapsed",
    props: { Label: "order_id" },
  });
  assert.match(html, /ds-lineage-node--sub/, "has the sub modifier");
});

test("lineage-individual-node: missing powerbi/identification-key icons degrade to nothing", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "lineage-individual-node",
    variant: "Type=Main item, State=Default, Fields=Collapsed",
    props: { Label: "orders" },
  });
  assert.doesNotMatch(
    html,
    /ds-lineage-node__source/,
    "no source wrapper span when powerbi icon is unmapped",
  );
  assert.doesNotMatch(
    html,
    /ds-lineage-node__key/,
    "no key wrapper span when identification-key icon is unmapped",
  );
});

test("lineage-individual-node: escapes a hostile Label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "lineage-individual-node",
    variant: "Type=Main item, State=Default, Fields=Collapsed",
    props: { Label: "<img src=x onerror=1>" },
  });
  assert.match(html, /&lt;img/, "label escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("lineage-grouped-node: default state, header only, no children shown", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "lineage-grouped-node",
    variant: "State=Default",
    props: { Label: "orders_pipeline" },
  });
  assert.match(html, /class="ds-lineage-group"/, "carries the base class");
  assert.doesNotMatch(
    html,
    /ds-lineage-group--expanded/,
    "not expanded by default",
  );
  assert.match(html, />orders_pipeline</, "renders the group label");
  assert.doesNotMatch(
    html,
    /ds-lineage-group__children/,
    "children hidden when not expanded",
  );
});

test("lineage-grouped-node: State=Expanded shows the expanded modifier and a child row", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "lineage-grouped-node",
    variant: "State=Expanded",
    props: { Label: "orders_pipeline", "Child label": "raw_orders" },
  });
  assert.match(
    html,
    /ds-lineage-group ds-lineage-group--expanded/,
    "has the expanded modifier",
  );
  assert.match(
    html,
    /ds-lineage-group__children/,
    "children container present when expanded",
  );
  assert.match(
    html,
    /ds-lineage-node ds-lineage-group__child/,
    "inlines a lineage-node-shaped child, not a recursive call",
  );
  assert.match(html, />raw_orders</, "renders the child label");
});

test("lineage-grouped-node: escapes a hostile Label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "lineage-grouped-node",
    variant: "State=Default",
    props: { Label: "<svg onload=1>" },
  });
  assert.match(html, /&lt;svg/, "label escaped");
  assert.doesNotMatch(html, /<svg onload/, "no raw injection");
});

test("metamodel: default Type (Dataset) border color, Show Section off", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "metamodel",
    variant: "",
    props: { Title: "customer" },
  });
  assert.match(
    html,
    /border-color:var\(--zen-color-primary-500, #0283be\)/,
    "Dataset's captured border, with token",
  );
  assert.doesNotMatch(
    html,
    /ds-metamodel__section"/,
    "no section when Show Section is falsy",
  );
  assert.match(html, />customer</, "renders the title");
});

test("metamodel: Type=Data Process has no captured token, bare hex", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "metamodel",
    variant: "Type=Data Process",
    props: { Title: "etl_job" },
  });
  assert.match(
    html,
    /border-color:#a82743"/,
    "Data Process' captured border, no token",
  );
});

test("metamodel: Show Section renders the collapsible section", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "metamodel",
    variant: "Type=Field",
    props: {
      Title: "email",
      "Show Section": true,
      "Section body": "Validated, unique",
    },
  });
  assert.match(
    html,
    /ds-metamodel__section"/,
    "section renders when Show Section is truthy",
  );
  assert.match(html, />Validated, unique</, "renders the section body");
});

test("metamodel: escapes a hostile Title", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "metamodel",
    variant: "",
    props: { Title: "<img src=x onerror=1>" },
  });
  assert.match(html, /&lt;img/, "title escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("loader-with-logo: default App (Actian Data Intelligence), renders the logo mark and spinner", function () {
  var DS = require(DS_PATH);
  DS.setGraphics(
    require("../../components/dist/graphics/graphics.json").graphics,
  );
  try {
    var html = DS.renderDSComponent({
      dsSlug: "loader-with-logo",
      variant: "",
      props: {},
    });
    assert.match(html, /class="ds-loader-with-logo"/, "carries the base class");
    assert.match(html, /ds-loader-with-logo__mark/, "has a logo-mark wrapper");
    assert.match(
      html,
      /class="ds-graphic"/,
      "renderGraphic emits the shared ds-graphic svg class",
    );
    assert.match(
      html,
      /ds-loader__spinner/,
      "still renders the spinner, composing with the existing loader chrome",
    );
  } finally {
    DS.setGraphics(null);
  }
});

test("loader-with-logo: App=Studio selects the Studio logo slug", function () {
  var DS = require(DS_PATH);
  DS.setGraphics(
    require("../../components/dist/graphics/graphics.json").graphics,
  );
  try {
    var html = DS.renderDSComponent({
      dsSlug: "loader-with-logo",
      variant: "App=Studio",
      props: {},
    });
    // The two Studio-vs-ADI logo bodies differ (see the fetched asset data);
    // asserting the Studio-specific top-level group id proves the right slug
    // was selected, not just that *a* graphic rendered.
    assert.match(
      html,
      /Actian Data Intelligence Studio/,
      "renders the Studio-specific logo group",
    );
  } finally {
    DS.setGraphics(null);
  }
});

test("loader-with-logo: an unmapped App falls back to the default (Actian Data Intelligence) logo", function () {
  var DS = require(DS_PATH);
  DS.setGraphics(
    require("../../components/dist/graphics/graphics.json").graphics,
  );
  try {
    var html = DS.renderDSComponent({
      dsSlug: "loader-with-logo",
      variant: "App=Nonexistent App",
      props: {},
    });
    assert.match(
      html,
      /class="ds-graphic"/,
      "still renders a graphic (the default), not a blank mark",
    );
  } finally {
    DS.setGraphics(null);
  }
});

test("loader-with-logo: Label prop renders the loader label span", function () {
  var DS = require(DS_PATH);
  DS.setGraphics(
    require("../../components/dist/graphics/graphics.json").graphics,
  );
  try {
    var html = DS.renderDSComponent({
      dsSlug: "loader-with-logo",
      variant: "",
      props: { Label: "Connecting" },
    });
    assert.match(html, /ds-loader__label">Connecting</, "renders the label");
  } finally {
    DS.setGraphics(null);
  }
});

test("error-state: base class and default title", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "error-state",
    variant: "",
    props: {},
  });
  assert.match(html, /class="ds-error-state"/, "carries the base class");
  assert.match(html, />Something went wrong</, "renders the default title");
});

test("error-state: illustration wired, default CTAs (Go back / Try again)", function () {
  var DS = require(DS_PATH);
  DS.setGraphics(
    require("../../components/dist/graphics/graphics.json").graphics,
  );
  try {
    var html = DS.renderDSComponent({
      dsSlug: "error-state",
      variant: "",
      props: {},
    });
    assert.match(
      html,
      /ds-error-state__illustration/,
      "illustration wrapper present",
    );
    assert.match(
      html,
      /class="ds-graphic"/,
      "renderGraphic emits the shared ds-graphic svg class",
    );
    // The generic ds-graphic class alone doesn't prove the RIGHT graphic was
    // selected (graphics.json has 11 entries, several sharing a viewBox).
    // "M187.136 160.462" is a coordinate from illustration-error-state's own
    // path data, verified unique across every entry in graphics.json -- its
    // presence proves the error-state-specific fallback slug was actually
    // resolved, not merely that *some* graphic rendered.
    assert.match(
      html,
      /M187\.136 160\.462/,
      "renders the illustration-error-state graphic specifically",
    );
    assert.match(
      html,
      /ds-button ds-button--tertiary ds-error-state__cta">Go back</,
      "secondary CTA renders as a tertiary button",
    );
    assert.match(
      html,
      /ds-button ds-button--primary ds-error-state__cta">Try again</,
      "primary CTA renders as a primary button",
    );
  } finally {
    DS.setGraphics(null);
  }
});

test("error-state: escapes hostile Title and clamps a hostile Size", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "error-state",
    variant: 'Size="><script>alert(1)</script>',
    props: { Title: "<img src=x onerror=alert(1)>" },
  });
  assert.match(html, /&lt;img/, "title escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection from Title");
  assert.match(
    html,
    /class="ds-error-state"/,
    "class attribute not broken out of by a hostile Size",
  );
  assert.doesNotMatch(
    html,
    /ds-error-state--medium/,
    "unknown Size falls back to large, no modifier",
  );
});

test("error-state: Size=Medium renders the ds-error-state--medium modifier", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "error-state",
    variant: "Size=Medium",
    props: {},
  });
  assert.match(
    html,
    /ds-error-state--medium/,
    "a valid Size=Medium renders the modifier class",
  );
});

test("maintenance-state: base structure, default headline and body", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "maintenance-state",
    variant: "",
    props: {},
  });
  assert.match(html, /class="ds-maintenance-state"/, "carries the base class");
  assert.match(
    html,
    /class="ds-maintenance-state__headline"/,
    "headline present",
  );
  assert.match(html, /class="ds-maintenance-state__body"/, "body present");
  assert.match(
    html,
    />Scheduled maintenance in progress until 12:00 PM EST</,
    "renders the default headline text",
  );
});

test("maintenance-state: default illustration is the maintenance graphic", function () {
  var DS = require(DS_PATH);
  DS.setGraphics(
    require("../../components/dist/graphics/graphics.json").graphics,
  );
  try {
    var htmlDefault = DS.renderDSComponent({
      dsSlug: "maintenance-state",
      variant: "",
      props: {},
    });
    var htmlErrorIllus = DS.renderDSComponent({
      dsSlug: "error-state",
      variant: "",
      props: {},
    });
    assert.match(
      htmlDefault,
      /class="ds-graphic"/,
      "renders a graphic by default",
    );
    // The maintenance and error illustrations are distinct assets in
    // graphics.json; comparing the two renders' svg bodies proves the
    // maintenance-specific fallback slug was actually selected, not merely
    // that *some* graphic rendered.
    assert.notEqual(
      htmlDefault.match(/<svg class="ds-graphic"[^]*?<\/svg>/)[0],
      htmlErrorIllus.match(/<svg class="ds-graphic"[^]*?<\/svg>/)[0],
      "maintenance-state's illustration differs from error-state's",
    );
  } finally {
    DS.setGraphics(null);
  }
});

test("maintenance-state: escapes a hostile Headline", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "maintenance-state",
    variant: "",
    props: { Headline: "<img src=x onerror=alert(1)>" },
  });
  assert.match(html, /&lt;img/, "headline escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("maintenance-state: renders both action buttons, tertiary before primary", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "maintenance-state",
    variant: "",
    props: {},
  });
  var tertiaryIdx = html.indexOf(
    "ds-button--tertiary ds-maintenance-state__cta",
  );
  var primaryIdx = html.indexOf("ds-button--primary ds-maintenance-state__cta");
  assert.ok(tertiaryIdx !== -1, "tertiary CTA present");
  assert.ok(primaryIdx !== -1, "primary CTA present");
  assert.ok(tertiaryIdx < primaryIdx, "tertiary CTA precedes primary CTA");
});

test("confirmation: base class and illustration wired", function () {
  var DS = require(DS_PATH);
  DS.setGraphics(
    require("../../components/dist/graphics/graphics.json").graphics,
  );
  try {
    var html = DS.renderDSComponent({
      dsSlug: "confirmation",
      variant: "",
      props: {},
    });
    assert.match(html, /class="ds-confirmation"/, "carries the base class");
    assert.match(
      html,
      /<svg class="ds-graphic"/,
      "renders a non-empty illustration svg",
    );
  } finally {
    DS.setGraphics(null);
  }
});

test("confirmation: both CTAs render with anatomy defaults", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "confirmation",
    variant: "",
    props: {},
  });
  assert.match(
    html,
    /<div class="ds-confirmation__actions">/,
    "actions row present",
  );
  assert.match(
    html,
    /ds-button ds-button--tertiary ds-confirmation__cta">Learn more</,
    "secondary CTA renders as a tertiary button with the anatomy default label",
  );
  assert.match(
    html,
    /ds-button ds-button--primary ds-confirmation__cta">Open the catalog</,
    "primary CTA renders as a primary button with the anatomy default label",
  );
});

test("confirmation: escapes hostile Title and Body", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "confirmation",
    variant: "",
    props: {
      Title: "<img src=x onerror=alert(1)>",
      Body: "<svg onload=alert(1)>",
    },
  });
  assert.match(html, /&lt;img/, "title escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection from Title");
  assert.match(html, /&lt;svg/, "body escaped");
  assert.doesNotMatch(html, /<svg onload/, "no raw injection from Body");
});

// ---- Tag family: the 2026-08-12 fold-in ----
//
// The breaking sync folded tag-shared, tag-catalog, tag-stage, tag-status and
// tag-glossary-item-type INTO "Tag, Default"'s new single `Type` axis, and
// renamed "Tag, Catalog item type" to "Tag, Item type" (whose axis became
// `Property 1`, absorbing the five glossary values plus fifteen custom slots).
// The five per-slug blocks that used to live here asserted exact class strings
// for components Figma no longer publishes.
//
// What replaces them is derived from published facts -- the registry's axis
// values and the anatomy's own per-value appearance/icon groups -- not from a
// hand-copied list of classes. A hand-copied list is what went stale: the old
// blocks kept passing while their subjects were being deleted upstream.
var TAG_MATRIX = require("../../components/render/renderer/matrix.js");
var TAG_DEFAULT_ANATOMY = require("../../components/dist/anatomy/tag-read-only.json");
var TAG_ITEM_TYPE_ANATOMY = require("../../components/dist/anatomy/tag-item-type.json");
var TAG_ICONS = require("../../components/dist/icons/icons.json").icons;

// The same normalization fidelity-classify.js applies to a captured variant
// value before matching it against a CSS modifier, so "the class the renderer
// emits" and "the value the capture names" are compared on one rule.
function modifierOf(value) {
  return String(value).toLowerCase().replace(/\s+/g, "-");
}

function axisOf(slug) {
  var comp = TAG_MATRIX.findComponent(slug);
  assert.ok(comp && comp.variants, slug + " is absent from every registry");
  var axes = Object.keys(comp.variants);
  assert.equal(
    axes.length,
    1,
    slug +
      " is expected to publish exactly one axis, got " +
      JSON.stringify(axes),
  );
  return { name: axes[0], values: comp.variants[axes[0]] };
}

// Every appearance group the capture records for the root, flattened to
// value -> group, so a test can ask "does this Type carry a colour delta".
function appearanceGroups(anatomy) {
  var byValue = {};
  ((anatomy.root.appearance || {}).variants || []).forEach(function (v) {
    (v.values || []).forEach(function (val) {
      byValue[val] = v;
    });
  });
  return byValue;
}

// The values `quality.structuralVariants` reports as having FEWER children than
// the captured canonical node, with the shortfall. This is the only place the
// capture states that a variant is missing a child; nothing in the per-variant
// appearance data says so, which is exactly why an icon that Figma does not
// contain can be rendered with `mismatch` at 0 forever -- the fidelity gate
// compares colours, and a spurious icon span carries none.
function structuralShortfalls(anatomy) {
  var out = {};
  ((anatomy.quality || {}).structuralVariants || []).forEach(function (e) {
    var m = /^childCount:(\d+)!=(\d+)$/.exec(String(e.reason || ""));
    if (!m) return;
    var canonical = Number(m[1]);
    var actual = Number(m[2]);
    if (actual < canonical) out[e.value] = canonical - actual;
  });
  return out;
}

// Split a derived fragment into { label -> component markup } pairs. Harness
// shape copied from derive-from-renderer.js's renderCell, deliberately not
// imported, for the same oracle-independence reason fragment-invariants.test.js
// states about these constants.
var CELL_OPEN =
  '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">';
var CAPTION_OPEN = '<span style="font:12px/1.4 sans-serif;opacity:0.55">';
function cellsByLabel(fragment) {
  var out = {};
  var from = 0;
  while (true) {
    var start = fragment.indexOf(CELL_OPEN, from);
    if (start === -1) break;
    var contentStart = start + CELL_OPEN.length;
    var captionStart = fragment.indexOf(CAPTION_OPEN, contentStart);
    if (captionStart === -1) break;
    var labelStart = captionStart + CAPTION_OPEN.length;
    var labelEnd = fragment.indexOf("</span>", labelStart);
    out[fragment.slice(labelStart, labelEnd)] = fragment.slice(
      contentStart,
      captionStart,
    );
    from = labelEnd + 1;
  }
  return out;
}

test("tag-read-only: every published Type value renders a class the anatomy can be checked against", function () {
  var DS = require(DS_PATH);
  var axis = axisOf("tag-read-only");
  var groups = appearanceGroups(TAG_DEFAULT_ANATOMY);
  var defaultValue = (TAG_DEFAULT_ANATOMY.variantDefaults || {})[axis.name];
  assert.ok(defaultValue, "the capture records no default for " + axis.name);

  // Emitted for EVERY value, including the captured default: singling the
  // default out in the renderer would hardcode which value the capture calls
  // its default. Which of these modifiers gets a ds-base.css RULE is the
  // separate question, and it is asserted against the capture's own colour
  // deltas by derive-canonical.test.js ("a rule for every captured tag variant
  // delta, and no no-op rule for the ones without one").
  var checked = 0;
  axis.values.forEach(function (value) {
    var html = DS.renderDSComponent({
      dsSlug: "tag-read-only",
      variant: axis.name + "=" + value,
      props: { Label: value },
    });
    assert.match(html, /class="ds-tag\b/, value + ": carries the base class");
    var modifier = "ds-tag--" + modifierOf(value);
    assert.match(
      html,
      new RegExp("\\b" + modifier + "\\b"),
      value + ": emits its own " + modifier + " modifier",
    );
    checked++;
  });
  assert.ok(checked > 1, "the registry axis probe found nothing to render");

  // The two facts the capture states that this renderer must NOT paper over:
  // Default and Stage-1 both carry no colour delta, so both render as the base
  // pill (their modifier matches no rule). Pinned here so an upstream change
  // that gives either one a real appearance group reds this premise instead of
  // silently leaving a published value unpainted.
  assert.ok(
    !groups["Stage-1"],
    "Stage-1 gained an appearance group upstream -- it now needs a ds-base.css " +
      "rule, and this test's premise (it renders as Default) is stale",
  );
  assert.ok(
    !groups[defaultValue],
    defaultValue +
      " is the captured default, so it must carry no appearance group of its " +
      "own; base .ds-tag is its paint",
  );
});

// THE THIRD capture fact, and the one the colour gate can never catch: a Type
// with FEWER children than the captured canonical node has no leading icon, so
// rendering one puts a glyph in the design system that Figma does not contain.
// `mismatch` stays 0 through it forever, because an icon span carries no colour.
//
// Today that is Type=Shared alone (canonical 2 children, Shared 1), corroborated
// independently: the pre-sync tag-shared capture at 504dd3d1^ had exactly one
// child, `Shared (text)`, and the retired tag-shared case rendered label-only.
// So the fold-in is what introduced the "+" glyph, not Figma.
//
// Both halves are asserted together, on purpose. The premise (the capture flags
// it, and the flag maps unambiguously onto one published boolean prop) is what
// makes the suppression legitimate; if a future capture drops the flag, this
// test reds instead of the glyph silently coming back. Nothing here names
// "Shared", so a second flagged value is picked up rather than diverging.
test("tag-read-only: a Type the capture flags as structurally reduced renders no leading icon", function () {
  var RENDERER = require("../../scripts/render/derive-from-renderer.js");
  var axis = axisOf("tag-read-only");
  var comp = TAG_MATRIX.findComponent("tag-read-only");
  var shortfalls = structuralShortfalls(TAG_DEFAULT_ANATOMY);
  var flagged = Object.keys(shortfalls);

  // PREMISE 1: the capture reports at least one structurally reduced value, and
  // every reported value is one the registry actually publishes.
  assert.ok(
    flagged.length > 0,
    "quality.structuralVariants reports no child-count shortfall, so this " +
      "test has no subject -- if the capture stopped flagging it, confirm the " +
      "variant really did gain its child back before deleting the suppression",
  );
  flagged.forEach(function (value) {
    assert.ok(
      axis.values.indexOf(value) !== -1,
      value +
        " is flagged as structurally reduced but is not a published " +
        axis.name,
    );
  });

  // PREMISE 2: the shortfall maps onto exactly one published default-TRUE
  // boolean, so "this variant is missing a child" resolves to one prop without
  // guessing. If a component ever grows a second optional child, this reds
  // rather than turning off the wrong one.
  var defaultTrueBooleans = Object.keys(comp.properties || {}).filter(
    function (k) {
      var p = comp.properties[k];
      return p && p.type === "BOOLEAN" && p.default === true;
    },
  );
  flagged.forEach(function (value) {
    assert.equal(
      defaultTrueBooleans.length,
      shortfalls[value],
      value +
        " is short " +
        shortfalls[value] +
        " child(ren) but the registry publishes " +
        defaultTrueBooleans.length +
        " default-true boolean(s) (" +
        JSON.stringify(defaultTrueBooleans) +
        "), so which optional child is absent is ambiguous",
    );
  });

  // CONSEQUENCE: the rendered cell emits no leading icon -- checked as the
  // wrapper span AND the glyph inside it, because the original defect was a
  // visible "+" Figma does not contain, and a wrapper can go while the glyph
  // stays.
  //
  // This block used to also assert the cell carried no `ds-tag--with-icon`.
  // That class has since been retired repo-wide (ruleless no-op modifier), so
  // no cell can carry it for reasons that have nothing to do with
  // structuralVariants: the assertion would now hold even if suppression broke
  // completely. It is deliberately NOT replaced in kind. What replaces it is
  // the surgical-suppression pair below, which can still fail.
  var cells = cellsByLabel(RENDERER.deriveFragment("tag-read-only"));
  flagged.forEach(function (value) {
    var cell = cells[value];
    assert.ok(cell, value + " has no cell in the fragment");
    assert.doesNotMatch(
      cell,
      /ds-tag__icon/,
      value +
        " is structurally reduced in the capture, so its cell must render no " +
        "leading icon span: " +
        cell,
    );
    assert.doesNotMatch(
      cell,
      /<svg/,
      value +
        " must render no icon GLYPH either -- dropping the wrapper while still " +
        "emitting the svg would put back the mark Figma does not contain: " +
        cell,
    );
    // SURGICAL: only the icon goes. The pill keeps its own Type modifier and
    // its label, so the two absences above cannot be satisfied by the cell
    // having collapsed to nothing.
    assert.match(
      cell,
      new RegExp("ds-tag--" + value.toLowerCase().replace(/\s+/g, "-") + "\\b"),
      value +
        " must still carry its own Type modifier; suppressing the icon must " +
        "not cost the pill its identity class: " +
        cell,
    );
    assert.ok(
      cell.indexOf(value) !== -1,
      value + " must still render its label: " + cell,
    );
  });

  // NON-VACUITY: an unflagged value still renders its icon -- span AND glyph,
  // matching both absences asserted above -- so those assertions cannot pass by
  // the renderer having dropped the icon everywhere.
  var unflagged = axis.values.filter(function (value) {
    return flagged.indexOf(value) === -1;
  });
  assert.ok(unflagged.length > 0, "every published value is flagged");
  var withIcon = unflagged.filter(function (value) {
    return (
      cells[value] &&
      /ds-tag__icon/.test(cells[value]) &&
      /<svg/.test(cells[value])
    );
  });
  assert.equal(
    withIcon.length,
    unflagged.length,
    "every value the capture does NOT flag must still render its leading " +
      "icon span and glyph; missing one on: " +
      JSON.stringify(
        unflagged.filter(function (v) {
          return withIcon.indexOf(v) === -1;
        }),
      ),
  );
});

test("tag-read-only: the Type modifier is shape-clamped before it reaches the class attribute (XSS)", function () {
  var DS = require(DS_PATH);
  // The payload carries exactly ONE "=" on purpose. parseVariant requires
  // `part.split("=").length === 2`, so a classic `x" onmouseover="alert(1)`
  // payload is dropped before the renderer ever sees it -- v.Type comes back
  // undefined, no modifier is emitted, and the assertions below pass whether or
  // not the clamp exists. Confirmed by mutation: with that payload, deleting the
  // clamp reds nothing. This one reaches the clamp.
  var html = DS.renderDSComponent({
    dsSlug: "tag-read-only",
    variant: 'Type=x"><script>alert(1)</script>',
    props: { Label: "x" },
  });
  assert.doesNotMatch(
    html,
    /<script/,
    "a hostile Type value must not break out of the class attribute",
  );
  // No modifier at all rather than a sanitized one: an ill-shaped value names
  // no published Type, so there is nothing to paint it as.
  assert.doesNotMatch(
    html,
    /ds-tag--x/,
    "an ill-shaped Type value emits no modifier of its own",
  );
});

test("tag-read-only: the leading icon slug follows the anatomy's per-Type instance swap", function () {
  var DS = require(DS_PATH);
  DS.setIcons(TAG_ICONS);
  try {
    var iconChild = (TAG_DEFAULT_ANATOMY.root.children || []).find(
      function (c) {
        return c.kind === "instance";
      },
    );
    assert.ok(iconChild, "the capture records no leading-icon instance child");
    // The child's own slug is the default icon; each variant group names the
    // slug that Type swaps in.
    var expected = { __default__: iconChild.slug };
    ((iconChild.appearance || {}).variants || []).forEach(function (v) {
      (v.values || []).forEach(function (val) {
        expected[val] = v.slug;
      });
    });
    assert.ok(
      Object.keys(expected).length > 2,
      "the capture records no per-Type icon swap, so this test proves nothing",
    );

    var axis = axisOf("tag-read-only");
    Object.keys(expected).forEach(function (value) {
      var slug = expected[value];
      assert.ok(
        TAG_ICONS[slug],
        "icon " + slug + " is missing from icons.json",
      );
      var variant =
        value === "__default__"
          ? axis.name +
            "=" +
            (TAG_DEFAULT_ANATOMY.variantDefaults || {})[axis.name]
          : axis.name + "=" + value;
      var html = DS.renderDSComponent({
        dsSlug: "tag-read-only",
        variant: variant,
        props: { Label: "x" },
      });
      assert.match(
        html,
        /<span class="ds-tag__icon"><svg class="ds-icon"[^>]*>[\s\S]+?<\/svg><\/span>/,
        variant + ": ds-tag__icon wraps a non-empty svg",
      );
      assert.ok(
        html.indexOf(TAG_ICONS[slug].body) !== -1,
        variant + ": renders the " + slug + " icon the capture names",
      );
    });
  } finally {
    DS.setIcons(null);
  }
});

test("tag-read-only: the leading icon is a default-TRUE boolean, and an explicit false omits it", function () {
  var DS = require(DS_PATH);
  DS.setIcons(TAG_ICONS);
  try {
    var comp = TAG_MATRIX.findComponent("tag-read-only");
    var prop = Object.keys(comp.properties || {}).find(function (k) {
      return /^Leading icon show/.test(k);
    });
    assert.ok(
      prop,
      "the registry no longer publishes a Leading icon show prop",
    );
    assert.equal(
      comp.properties[prop].default,
      true,
      "this test's premise is that the registry default is true",
    );
    var shown = DS.renderDSComponent({
      dsSlug: "tag-read-only",
      variant: "Type=Default",
      props: { Label: "x" },
    });
    assert.match(
      shown,
      /ds-tag__icon/,
      "absent prop honours the registry default",
    );
    var hidden = DS.renderDSComponent({
      dsSlug: "tag-read-only",
      variant: "Type=Default",
      props: { Label: "x", "Leading icon show": false },
    });
    assert.doesNotMatch(
      hidden,
      /ds-tag__icon/,
      "an explicit false omits the icon",
    );
  } finally {
    DS.setIcons(null);
  }
});

test("tag-read-only: escapes a hostile Label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-read-only",
    variant: "Type=Default",
    props: { Label: "<img src=x onerror=alert(1)>" },
  });
  assert.match(html, /&lt;img/, "label escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("tag-item-type: every published value renders its own modifier class", function () {
  var DS = require(DS_PATH);
  var axis = axisOf("tag-item-type");
  var groups = appearanceGroups(TAG_ITEM_TYPE_ANATOMY);
  var defaultValue = (TAG_ITEM_TYPE_ANATOMY.variantDefaults || {})[axis.name];
  assert.ok(defaultValue, "the capture records no default for " + axis.name);
  assert.ok(
    axis.values.indexOf("Glossary-1") !== -1,
    "the glossary values must have folded into this component's axis -- " +
      "tag-glossary-item-type was retired into it",
  );

  axis.values.forEach(function (value) {
    var html = DS.renderDSComponent({
      dsSlug: "tag-item-type",
      variant: axis.name + "=" + value,
      props: { Label: value },
    });
    assert.match(
      html,
      /class="ds-tag-item-type\b/,
      value + ": carries the base class",
    );
    var modifier = "ds-tag-item-type--" + modifierOf(value);
    assert.match(
      html,
      new RegExp("\\b" + modifier + "\\b"),
      value + ": emits its own " + modifier + " modifier",
    );
    assert.ok(
      html.indexOf(">" + value + "<") !== -1,
      value + ": renders its label text",
    );
  });
  // Same split as tag-read-only: the modifier is emitted for every value, and
  // WHICH modifiers get a rule is the capture's business. The captured default
  // carries no appearance group of its own -- base .ds-tag-item-type is its
  // paint -- so a rule for it would restate the base.
  assert.ok(
    !groups[defaultValue],
    defaultValue +
      " is the captured default, so it must carry no appearance group of its own",
  );
  assert.ok(
    Object.keys(groups).length > 1,
    "the capture records no per-value colour groups",
  );
});

test("tag-item-type: the modifier is shape-clamped before it reaches the class attribute (XSS)", function () {
  var DS = require(DS_PATH);
  // One "=" only, for the reason spelled out in tag-read-only's XSS test above:
  // parseVariant silently drops a part with two, so a two-"=" payload never
  // reaches the clamp and the assertion holds vacuously.
  var html = DS.renderDSComponent({
    dsSlug: "tag-item-type",
    variant: 'Property 1=x"><script>alert(1)</script>',
    props: { Label: "x" },
  });
  assert.doesNotMatch(
    html,
    /<script/,
    "a hostile value must not break out of the class attribute",
  );
  assert.doesNotMatch(
    html,
    /ds-tag-item-type--x/,
    "an ill-shaped value emits no modifier of its own",
  );
});

test("tag-item-type: counter gating and escapes hostile Label", function () {
  var DS = require(DS_PATH);
  var withCounter = DS.renderDSComponent({
    dsSlug: "tag-item-type",
    variant: "Property 1=Category",
    props: { "Show counter": true, Counter: "42" },
  });
  assert.match(
    withCounter,
    /<span class="ds-tag-item-type__counter">42<\/span>/,
    "counter renders when Show counter is truthy",
  );

  var withoutCounter = DS.renderDSComponent({
    dsSlug: "tag-item-type",
    variant: "Property 1=Category",
    props: {},
  });
  assert.doesNotMatch(
    withoutCounter,
    /ds-tag-item-type__counter/,
    "no counter span when Show counter is absent/false",
  );

  var hostile = DS.renderDSComponent({
    dsSlug: "tag-item-type",
    variant: "Property 1=Category",
    props: { Label: "<img src=x onerror=alert(1)>" },
  });
  assert.match(hostile, /&lt;img/, "label escaped");
  assert.doesNotMatch(hostile, /<img src=x/, "no raw injection");
});

// The retired slugs must degrade to the graceful chip, not keep a live case.
// A stale case is invisible: it renders plausible markup for a component the
// design system no longer publishes, which is the fabrication invariant 10 in
// fragment-invariants.test.js exists to prevent one level up.
test("the five retired tag slugs have no renderer case left", function () {
  var DS = require(DS_PATH);
  [
    "tag-shared",
    "tag-catalog",
    "tag-stage",
    "tag-status",
    "tag-glossary-item-type",
    "tag-catalog-item-type",
  ].forEach(function (slug) {
    assert.equal(
      DS.BUILT_SLUGS.indexOf(slug),
      -1,
      slug + " is still listed in BUILT_SLUGS",
    );
    var html = DS.renderDSComponent({ dsSlug: slug, name: slug, props: {} });
    assert.match(
      html,
      /<span class="ds-component" data-slug=/,
      slug + " must degrade to the graceful chip, not render a retired case",
    );
  });
});

// ---- Gray-box-to-zero, family 3 (card family) ----

test("card-for-perimeter: base class present", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "card-for-perimeter",
    variant: "Property 1=Default",
    props: {},
  });
  assert.match(html, /class="ds-card-perimeter"/, "carries the base class");
});

test("card-for-perimeter: badge color is data-derived (Dataset -> #cfeafd), not hand-guessed", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "card-for-perimeter",
    variant: "Property 1=Default",
    props: { "Item type": "Dataset", "Item type initials": "DS" },
  });
  assert.match(
    html,
    /<span class="ds-item-type" style="background:#cfeafd">DS<\/span>/,
    "digramItemTypeStyle produces the captured Dataset color",
  );
});

test("card-for-perimeter: escapes hostile Name", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "card-for-perimeter",
    variant: "Property 1=Default",
    props: { Name: "<script>alert(1)</script>" },
  });
  assert.match(html, /&lt;script&gt;/, "name escaped");
  assert.doesNotMatch(html, /<script>alert/, "no raw injection");
});

test("card-for-perimeter: Completeness clamps into the progress fill width", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "card-for-perimeter",
    variant: "Property 1=Default",
    props: { Completeness: "75%" },
  });
  assert.match(
    html,
    /<span class="ds-progress__fill" style="width:75%"><\/span>/,
    "Completeness drives the progress fill width",
  );
});

test("card-for-grouped-content: base class + structural divider present", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "card-for-grouped-content",
    variant: "Property 1=Default",
    props: { Title: "Grouped content", Body: "Body copy." },
  });
  assert.match(html, /class="ds-card-grouped"/, "carries the base class");
  assert.match(
    html,
    /<div class="ds-card-grouped__divider"><\/div>/,
    "the captured Divider is structural, not optional",
  );
});

test("card-for-grouped-content: info-icon toggle + escapes hostile Title", function () {
  var DS = require(DS_PATH);
  var withIcon = DS.renderDSComponent({
    dsSlug: "card-for-grouped-content",
    variant: "Property 1=Default",
    props: { Title: "Grouped content" },
  });
  assert.match(
    withIcon,
    /ds-card-grouped__info/,
    "Show info icon defaults to shown",
  );

  var withoutIcon = DS.renderDSComponent({
    dsSlug: "card-for-grouped-content",
    variant: "Property 1=Default",
    props: { Title: "Grouped content", "Show info icon": false },
  });
  assert.doesNotMatch(
    withoutIcon,
    /ds-card-grouped__info/,
    "Show info icon:false omits the __info span",
  );

  var hostile = DS.renderDSComponent({
    dsSlug: "card-for-grouped-content",
    variant: "Property 1=Default",
    props: { Title: "<img src=x onerror=1>" },
  });
  assert.match(hostile, /&lt;img/, "title escaped");
  assert.doesNotMatch(hostile, /<img src=x/, "no raw injection");
});

test("card-for-grouped-content: divider color is token-bound, no hardcoded hex", function () {
  var css = require("node:fs").readFileSync(
    require("node:path").join(
      __dirname,
      "../../components/render/renderer/ds-base.css",
    ),
    "utf8",
  );
  var match = css.match(/\.ds-card-grouped__divider\s*\{([^}]*)\}/);
  assert.ok(match, "the __divider rule exists");
  // Strip comments before judging: documenting the captured hex in a
  // trailing comment (the codebase's own round-trip-provenance convention,
  // e.g. tag-status's per-family comments) is not the same as hardcoding it
  // as the effective declaration VALUE, which is what this assertion guards.
  var declOnly = match[1].replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(
    declOnly,
    /background:\s*var\(--zen-border-default\)/,
    "background resolves to the captured token",
  );
  assert.doesNotMatch(
    declOnly,
    /#[0-9a-fA-F]{3,6}/,
    "no hardcoded hex fallback as the declared value",
  );
});

test("search-result-card: base class present, Title renders in __title", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "search-result-card",
    variant: "App=Explorer, State=Default",
    props: { Title: "Financial Summary EY2024" },
  });
  assert.match(html, /class="ds-search-result-card"/, "carries the base class");
  assert.match(
    html,
    /<span class="ds-search-result-card__title">Financial Summary EY2024<\/span>/,
    "Title renders in __title",
  );
});

test("search-result-card: State=Selected adds the --selected modifier", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "search-result-card",
    variant: "App=Explorer, State=Selected",
    props: {},
  });
  assert.match(
    html,
    /ds-search-result-card--selected/,
    "State=Selected adds the modifier class",
  );
});

test("search-result-card: escapes hostile Title", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "search-result-card",
    variant: "App=Explorer, State=Default",
    props: { Title: "<img src=x onerror=alert(1)>" },
  });
  assert.match(html, /&lt;img/, "title escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("search-result-card: State=Focus adds the --focus modifier (distinct from --selected)", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "search-result-card",
    variant: "App=Explorer, State=Focus",
    props: {},
  });
  assert.match(
    html,
    /ds-search-result-card--focus/,
    "State=Focus adds its own modifier class",
  );
  assert.doesNotMatch(
    html,
    /ds-search-result-card--selected/,
    "Focus does not also carry the selected modifier",
  );
});

test("search-result-card: App=Studio renders the base card with no --studio modifier", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "search-result-card",
    variant: "App=Studio, State=Default",
    props: { Title: "Studio Result" },
  });
  // Studio's structural swaps (button -> progress-bar-small, digram ->
  // tag-read-only) are intentionally not built for this leaf -- there is no
  // CSS delta, so App=Studio renders the BASE card with no root modifier
  // (a modifier must carry a real visual delta, never a no-op namespace
  // hook; see ds-base.css). This asserts it renders without error.
  assert.match(
    html,
    /class="ds-search-result-card"/,
    "carries only the base class",
  );
  assert.doesNotMatch(
    html,
    /ds-search-result-card--studio/,
    "does not carry a no-op modifier class",
  );
  assert.match(
    html,
    /<span class="ds-search-result-card__title">Studio Result<\/span>/,
    "renders Title in __title",
  );
});

test("search-result-card: --selected and --focus modifiers actually differ from the base (no silent no-op)", function () {
  var css = require("node:fs").readFileSync(
    require("node:path").join(
      __dirname,
      "../../components/render/renderer/ds-base.css",
    ),
    "utf8",
  );
  var base = css.match(/\.ds-search-result-card\s*\{([^}]*)\}/);
  var selected = css.match(/\.ds-search-result-card--selected\s*\{([^}]*)\}/);
  var focus = css.match(/\.ds-search-result-card--focus\s*\{([^}]*)\}/);
  assert.ok(base && selected && focus, "all three rules exist");
  assert.notEqual(
    base[1].trim(),
    selected[1].trim(),
    "--selected must not just re-declare the base rule verbatim",
  );
  assert.notEqual(
    base[1].trim(),
    focus[1].trim(),
    "--focus must not just re-declare the base rule verbatim",
  );
  assert.match(
    selected[1],
    /var\(--zen-border-selected\)/,
    "--selected carries the border-selected token",
  );
  assert.match(
    focus[1],
    /var\(--zen-focus-ring-primary\)/,
    "--focus carries the focus-ring token",
  );
});

// ============ Gray-box-to-zero, family 4 (dropdowns / overlays) ============

test("notification-dropdown: base class + role + exactly 3 item rows (List, default Items)", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "notification-dropdown",
    variant: "Property 1=List",
    props: {},
  });
  assert.match(html, /class="ds-notification-menu"/, "carries the base class");
  assert.match(html, /role="menu"/, "carries menu role");
  // The default Items fallback embeds three comma-free timestamps
  // ("7/11/25 12:42 AM.", "7/6/25 12:42 AM.", "7/3/25 4:47 PM.") -- a
  // regression here (a comma reintroduced inside a timestamp) would split
  // parseItems' comma-delimited list into 4 or 5 garbled rows instead of 3.
  var itemMatches = html.match(/ds-notification-menu__item\b/g) || [];
  assert.equal(
    itemMatches.length,
    3,
    "renders exactly 3 item rows for the default Items, got: " +
      itemMatches.length,
  );
});

test("notification-dropdown: custom Items renders exactly the given rows (proves Items is rendered, not dropped)", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "notification-dropdown",
    variant: "Property 1=List",
    props: { Items: "First alpha update,Second beta update" },
  });
  var itemMatches = html.match(/ds-notification-menu__item\b/g) || [];
  assert.equal(
    itemMatches.length,
    2,
    "renders exactly 2 item rows for the 2-entry Items prop",
  );
  assert.match(html, /First alpha update/, "renders the first label");
  assert.match(html, /Second beta update/, "renders the second label");
});

test("notification-dropdown: Property 1=Empty swaps in the empty copy, no item rows", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "notification-dropdown",
    variant: "Property 1=Empty",
    props: {},
  });
  assert.match(
    html,
    /ds-notification-menu--empty/,
    "carries the empty modifier class",
  );
  assert.match(html, /You're all caught up\./, "renders the empty copy");
  assert.doesNotMatch(
    html,
    /ds-notification-menu__item/,
    "no item rows in the empty variant",
  );
});

test("notification-dropdown: escapes hostile Items and Header (raw absent, escaped present)", function () {
  var DS = require(DS_PATH);
  var hostileHeader = "<script>alert(1)</script>";
  var hostileItems = "<script>alert(2)</script>";
  var html = DS.renderDSComponent({
    dsSlug: "notification-dropdown",
    variant: "Property 1=List",
    props: {
      Header: hostileHeader,
      Items: hostileItems,
    },
  });
  // Distinguish "escaped" from "dropped": a naive fix that simply omitted
  // the hostile props would also make the raw-payload assertions below
  // pass, so also require the escaped form to be present.
  assert.equal(
    html.indexOf(hostileHeader),
    -1,
    "the raw Header payload is absent",
  );
  assert.equal(
    html.indexOf(hostileItems),
    -1,
    "the raw Items payload is absent",
  );
  assert.doesNotMatch(html, /<script>/, "no raw script tag anywhere");
  assert.match(
    html,
    /&lt;script&gt;alert\(1\)&lt;\/script&gt;/,
    "Header's escaped form is present",
  );
  assert.match(
    html,
    /&lt;script&gt;alert\(2\)&lt;\/script&gt;/,
    "Items' escaped form is present",
  );
});

test("search-dropdown-menu: base class + role present (After typed)", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "search-dropdown-menu",
    variant: "Type=After typed",
    props: {},
  });
  assert.match(html, /class="ds-search-menu/, "carries the base class");
  assert.match(html, /role="menu"/, "carries menu role");
});

test("search-dropdown-menu: Type=After typed renders the base class only (no-op modifier dropped), with item rows", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "search-dropdown-menu",
    variant: "Type=After typed",
    props: { Results: "orders,invoices" },
  });
  // After typed IS the captured anatomy default -- its CSS rule was a
  // no-op, so it renders the BASE class with no --after-typed modifier
  // (see ds-base.css); the variant is distinguished by its CONTENT
  // (row list + "Suggestions" heading) instead.
  assert.match(html, /class="ds-search-menu"/, "carries only the base class");
  assert.doesNotMatch(
    html,
    /ds-search-menu--after-typed/,
    "does not carry a no-op modifier class",
  );
  assert.match(
    html,
    /ds-search-menu__heading">Suggestions</,
    "renders the Suggestions heading",
  );
  var itemMatches = html.match(/ds-search-menu__item\b/g) || [];
  assert.equal(itemMatches.length, 2, "renders a row per result");
});

test("search-dropdown-menu: Type=Before typed renders the base class only (no-op modifier dropped), with the Recent heading", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "search-dropdown-menu",
    variant: "Type=Before typed",
    props: {},
  });
  // Before typed differs from After typed only in CONTENT (the "Recent"
  // heading + which items render), never in CSS -- so it also renders the
  // BASE class with no --before-typed modifier (see ds-base.css).
  assert.match(html, /class="ds-search-menu"/, "carries only the base class");
  assert.doesNotMatch(
    html,
    /ds-search-menu--before-typed/,
    "does not carry a no-op modifier class",
  );
  assert.match(
    html,
    /ds-search-menu__heading">Recent</,
    "renders the Recent heading",
  );
});

test("search-dropdown-menu: Type=No result branches to the empty message, no item rows", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "search-dropdown-menu",
    variant: "Type=No result",
    props: { Query: "orders" },
  });
  assert.match(
    html,
    /ds-search-menu--no-result/,
    "carries the no-result modifier",
  );
  assert.match(html, /ds-search-menu__empty/, "carries the empty class");
  assert.match(
    html,
    /No matches for &quot;orders&quot;/,
    "renders the escaped query in the empty message",
  );
  assert.doesNotMatch(
    html,
    /ds-search-menu__item/,
    "no result rows in the no-result variant",
  );
});

test("search-dropdown-menu: escapes a hostile result label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "search-dropdown-menu",
    variant: "Type=After typed",
    props: { Results: "<img src=x onerror=alert(1)>" },
  });
  assert.match(html, /&lt;img/, "hostile label escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("whats-new-dropdown: base class + role + default title present", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "whats-new-dropdown",
    variant: "",
    props: {},
  });
  assert.match(html, /class="ds-whatsnew/, "carries the base class");
  assert.match(html, /role="menu"/, "carries menu role");
  assert.match(html, /What&#39;s new|What's new/, "renders the default title");
});

test("whats-new-dropdown: Property 1=Empty and List branch to the right modifier + body", function () {
  var DS = require(DS_PATH);
  var htmlEmpty = DS.renderDSComponent({
    dsSlug: "whats-new-dropdown",
    variant: "Property 1=Empty",
    props: {},
  });
  // Empty IS the captured anatomy default -- its CSS rule was a no-op, so
  // it renders the BASE class with no --empty modifier (see ds-base.css);
  // the variant is distinguished by its CONTENT instead.
  assert.match(
    htmlEmpty,
    /class="ds-whatsnew"/,
    "empty carries only the base class",
  );
  assert.doesNotMatch(
    htmlEmpty,
    /ds-whatsnew--empty/,
    "empty does not carry a no-op modifier class",
  );
  assert.match(
    htmlEmpty,
    /ds-whatsnew__empty/,
    "renders the empty content wrapper",
  );
  assert.match(htmlEmpty, /No release updates/, "empty renders its body copy");
  assert.doesNotMatch(htmlEmpty, /ds-whatsnew__item/, "empty has no item rows");

  var htmlList = DS.renderDSComponent({
    dsSlug: "whats-new-dropdown",
    variant: "Property 1=List",
    props: { Items: "A,B" },
  });
  assert.match(htmlList, /ds-whatsnew--list/, "list carries its modifier");
  // Negative lookahead excludes the __items wrapper div (a substring match
  // of __item), so this counts only the per-row __item elements.
  var itemMatches = htmlList.match(/ds-whatsnew__item(?!s)/g) || [];
  assert.equal(itemMatches.length, 2, "renders two item rows for A,B");
  assert.doesNotMatch(
    htmlList,
    /ds-whatsnew__empty/,
    "list does not carry the empty class",
  );
});

test("whats-new-dropdown: Property 1=Drilldown1 normalizes to the drilldown modifier with a back affordance", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "whats-new-dropdown",
    variant: "Property 1=Drilldown1",
    props: {},
  });
  assert.match(
    html,
    /ds-whatsnew--drilldown/,
    "Drilldown1 normalizes to the drilldown modifier",
  );
  assert.match(html, /ds-whatsnew__back/, "renders the back affordance");
});

test("whats-new-dropdown: escapes a hostile Title and a hostile Items entry", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "whats-new-dropdown",
    variant: "Property 1=List",
    props: {
      Title: "<img src=x onerror=alert(1)>",
      Items: "<img src=x onerror=alert(2)>",
    },
  });
  assert.match(html, /&lt;img/, "hostile text escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("drawer-side-panel: base class + role=dialog + aria-label present", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "drawer-side-panel",
    variant: "App=Studio",
    props: {},
  });
  assert.match(html, /class="ds-drawer"/, "carries the base class");
  assert.match(html, /role="dialog"/, "carries dialog role");
  assert.match(html, /aria-label="[^"]+"/, "carries an aria-label");
});

test("drawer-side-panel: hostile Name renders escaped inside __title", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "drawer-side-panel",
    variant: "App=Studio",
    props: { Name: "<img src=x onerror=alert(1)>" },
  });
  assert.match(html, /&lt;img/, "hostile Name is escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("drawer-side-panel: App=Explorer adds the modifier, App=Studio (default) does not", function () {
  var DS = require(DS_PATH);
  var htmlExplorer = DS.renderDSComponent({
    dsSlug: "drawer-side-panel",
    variant: "App=Explorer",
    props: {},
  });
  assert.match(
    htmlExplorer,
    /ds-drawer--explorer/,
    "Explorer carries the modifier class",
  );

  var htmlStudio = DS.renderDSComponent({
    dsSlug: "drawer-side-panel",
    variant: "App=Studio",
    props: {},
  });
  assert.doesNotMatch(
    htmlStudio,
    /ds-drawer--explorer/,
    "Studio (default) does not carry the Explorer modifier",
  );
});

test("drawer-side-panel: Show Back=false omits the back button; default renders it", function () {
  var DS = require(DS_PATH);
  var htmlDefault = DS.renderDSComponent({
    dsSlug: "drawer-side-panel",
    variant: "App=Studio",
    props: {},
  });
  assert.match(
    htmlDefault,
    /ds-drawer__back/,
    "back button renders by default",
  );

  var htmlNoBack = DS.renderDSComponent({
    dsSlug: "drawer-side-panel",
    variant: "App=Studio",
    props: { "Show Back": false },
  });
  assert.doesNotMatch(
    htmlNoBack,
    /ds-drawer__back/,
    "Show Back=false omits the back button",
  );
});

test("drawer-side-panel: --explorer modifier rule actually differs from the base (no silent no-op)", function () {
  var css = require("node:fs").readFileSync(
    require("node:path").join(
      __dirname,
      "../../components/render/renderer/ds-base.css",
    ),
    "utf8",
  );
  var base = css.match(/\.ds-drawer\s*\{([^}]*)\}/);
  var explorer = css.match(/\.ds-drawer--explorer\s*\{([^}]*)\}/);
  assert.ok(base && explorer, "both rules exist");
  assert.notEqual(base[1].trim(), "", "base rule is not empty");
  assert.notEqual(
    explorer[1].trim(),
    "",
    "--explorer must not be an empty no-op rule",
  );
});

test("no silent no-op modifiers remain among .ds-search-menu--*, .ds-whatsnew--*, .ds-search-result-card--* rules", function () {
  // Guard for the uniform rule: a root modifier class is emitted only when
  // it carries a real visual delta from its base. This audits every
  // remaining rule in these three families and fails if any body is
  // empty or comment-only (i.e. has no actual declaration) -- catching a
  // future regression back to a namespace-hook no-op, the same class of
  // bug fixed for --after-typed / --before-typed / whats-new --empty /
  // search-result-card --studio.
  var css = require("node:fs").readFileSync(
    require("node:path").join(
      __dirname,
      "../../components/render/renderer/ds-base.css",
    ),
    "utf8",
  );
  var ruleRe =
    /\.(ds-search-menu|ds-whatsnew|ds-search-result-card)--[a-z0-9-]+\s*\{([^}]*)\}/g;
  var checked = [];
  var match;
  while ((match = ruleRe.exec(css)) !== null) {
    var selector = match[0].slice(0, match[0].indexOf("{")).trim();
    var body = match[2];
    var bodyWithoutComments = body.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    checked.push(selector);
    assert.ok(
      bodyWithoutComments.length > 0 && /:/.test(bodyWithoutComments),
      selector +
        " must contain at least one real CSS declaration, not just a comment",
    );
  }
  assert.ok(
    checked.length >= 4,
    "audit found the expected modifier rules (--no-result, --explorer-home, --list, --drilldown, --selected, --focus, ...)",
  );
  // Sanity: the rules we expect to have been dropped are actually gone.
  assert.doesNotMatch(css, /\.ds-search-menu--after-typed\s*\{/);
  assert.doesNotMatch(css, /\.ds-search-menu--before-typed\s*\{/);
  assert.doesNotMatch(css, /\.ds-whatsnew--empty\s*\{/);
  assert.doesNotMatch(css, /\.ds-search-result-card--studio\s*\{/);
});

// ===================================================================== //
// Gray-box-to-zero, family 5 (primitives): spinner, loading-skeleton,   //
// scroll-bar, link, avatar, collapse-accordion.                         //
// ===================================================================== //

test("spinner: base structure, role=status, single ring", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "spinner",
    variant: "Color mode=On light bg",
    props: {},
  });
  assert.match(html, /class="ds-spinner"/, "carries the base class");
  assert.match(html, /role="status"/, "carries status role");
  assert.match(html, /aria-live="polite"/, "carries aria-live");
  var ringMatches = html.match(/<span class="ds-spinner__ring"/g) || [];
  assert.equal(ringMatches.length, 1, "exactly one ring element");
});

test("spinner: Color mode=On dark bg adds the modifier, light (default) does not", function () {
  var DS = require(DS_PATH);
  var htmlDark = DS.renderDSComponent({
    dsSlug: "spinner",
    variant: "Color mode=On dark bg",
    props: {},
  });
  assert.match(htmlDark, /ds-spinner--on-dark/, "dark carries the modifier");

  var htmlLight = DS.renderDSComponent({
    dsSlug: "spinner",
    variant: "Color mode=On light bg",
    props: {},
  });
  assert.doesNotMatch(
    htmlLight,
    /ds-spinner--on-dark/,
    "light does not carry the dark modifier",
  );
});

test("spinner: escapes hostile Label; no Label omits the label span and defaults aria-label", function () {
  var DS = require(DS_PATH);
  var hostile = DS.renderDSComponent({
    dsSlug: "spinner",
    variant: "Color mode=On light bg",
    props: { Label: "<img src=x onerror=alert(1)>" },
  });
  assert.doesNotMatch(hostile, /<img src=x/, "no raw injection");
  assert.match(
    hostile,
    /aria-label="&lt;img[^"]*"/,
    "escaped payload appears in aria-label",
  );
  assert.match(
    hostile,
    /<span class="ds-spinner__label">&lt;img[^<]*<\/span>/,
    "escaped payload appears in the label span",
  );

  var noLabel = DS.renderDSComponent({
    dsSlug: "spinner",
    variant: "Color mode=On light bg",
    props: {},
  });
  assert.doesNotMatch(
    noLabel,
    /ds-spinner__label/,
    "no Label prop means no label element",
  );
  assert.match(noLabel, /aria-label="Loading"/, "defaults aria-label");
});

test("loading-skeleton: base + no-copy, role=status, blocks are empty and aria-hidden", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "loading-skeleton",
    variant: "",
    props: {},
  });
  assert.match(html, /class="ds-loading-skeleton"/, "carries the base class");
  assert.match(html, /role="status"/, "carries status role");
  assert.doesNotMatch(
    html,
    /Loading\.\.\./,
    "no placeholder copy inside skeleton blocks",
  );
  var blockMatches =
    html.match(
      /<span class="ds-loading-skeleton__block[^"]*"[^>]*><\/span>/g,
    ) || [];
  assert.ok(blockMatches.length > 0, "renders at least one block");
  blockMatches.forEach(function (m) {
    assert.match(m, /aria-hidden="true"/, "every block is aria-hidden");
  });
});

test("loading-skeleton: renders at least 3 block elements, each aria-hidden", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "loading-skeleton",
    variant: "",
    props: {},
  });
  var blockMatches = html.match(/ds-loading-skeleton__block/g) || [];
  assert.ok(
    blockMatches.length >= 3,
    "at least 3 occurrences of ds-loading-skeleton__block",
  );
  var hiddenMatches = html.match(/aria-hidden="true"/g) || [];
  assert.ok(hiddenMatches.length >= 3, "at least 3 aria-hidden blocks");
});

test("loading-skeleton: Transition=2 carries is-transition-2, default/1 does not", function () {
  var DS = require(DS_PATH);
  var htmlTwo = DS.renderDSComponent({
    dsSlug: "loading-skeleton",
    variant: "Transition=2",
    props: {},
  });
  assert.match(htmlTwo, /is-transition-2/, "Transition=2 carries the modifier");

  var htmlOne = DS.renderDSComponent({
    dsSlug: "loading-skeleton",
    variant: "Transition=1",
    props: {},
  });
  assert.doesNotMatch(
    htmlOne,
    /is-transition-2/,
    "Transition=1 (default) does not carry the modifier",
  );
});

test("loading-skeleton: has no text sink -- hostile Label never appears", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "loading-skeleton",
    variant: "",
    props: { Label: "<img src=x onerror=alert(1)>" },
  });
  assert.doesNotMatch(html, /<img/, "hostile Label is never rendered");
  assert.doesNotMatch(html, /onerror/, "hostile Label is never rendered");
});

test("scroll-bar: base structure, thumb child, role=scrollbar, vertical default", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "scroll-bar",
    variant: "Property 1=Default",
    props: {},
  });
  assert.match(html, /class="ds-scroll-bar"/, "carries the base class");
  assert.match(
    html,
    /<span class="ds-scroll-bar__thumb"/,
    "renders the thumb child",
  );
  assert.match(html, /role="scrollbar"/, "carries scrollbar role");
  assert.match(
    html,
    /aria-orientation="vertical"/,
    "defaults to vertical orientation",
  );
});

test("scroll-bar: Orientation=Horizontal adds the modifier + flips aria-orientation; default has neither", function () {
  var DS = require(DS_PATH);
  var htmlH = DS.renderDSComponent({
    dsSlug: "scroll-bar",
    variant: "Property 1=Default",
    props: { Orientation: "Horizontal" },
  });
  assert.match(
    htmlH,
    /ds-scroll-bar--horizontal/,
    "horizontal carries the modifier class",
  );
  assert.match(
    htmlH,
    /aria-orientation="horizontal"/,
    "horizontal flips aria-orientation",
  );

  var htmlV = DS.renderDSComponent({
    dsSlug: "scroll-bar",
    variant: "Property 1=Default",
    props: {},
  });
  assert.doesNotMatch(
    htmlV,
    /ds-scroll-bar--horizontal/,
    "default does not carry the horizontal modifier",
  );
  assert.doesNotMatch(
    htmlV,
    /aria-orientation="horizontal"/,
    "default does not report horizontal orientation",
  );
});

test("scroll-bar: escapes a hostile Label into aria-label only", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "scroll-bar",
    variant: "Property 1=Default",
    props: { Label: '"><script>alert(1)</script>' },
  });
  assert.doesNotMatch(html, /<script>/, "no raw script tag");
  assert.match(
    html,
    /aria-label="[^"]*&lt;script&gt;[^"]*"/,
    "escaped payload appears only inside aria-label",
  );
});

test("scroll-bar: clamps Position/Length to [0,100]", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "scroll-bar",
    variant: "Property 1=Default",
    props: { Position: "150", Length: "-5" },
  });
  assert.match(html, /top:100%/, "Position clamps down to 100");
  assert.match(html, /height:0%/, "Length clamps up to 0");
});

test("link: base -- <a> tag, base class, escaped label text", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "link",
    variant: "State=Default",
    props: { Label: "View details" },
  });
  assert.match(
    html,
    /<a class="ds-link"/,
    "renders an <a> with the base class",
  );
  assert.match(html, />View details</, "renders the label text");
});

test("link: State=Disabled adds is-disabled + aria-disabled; State=Visited adds the modifier", function () {
  var DS = require(DS_PATH);
  var htmlDisabled = DS.renderDSComponent({
    dsSlug: "link",
    variant: "State=Disabled",
    props: { Label: "View details" },
  });
  assert.match(htmlDisabled, /is-disabled/, "carries is-disabled");
  assert.match(
    htmlDisabled,
    /aria-disabled="true"/,
    "carries aria-disabled (an <a> has no disabled attribute)",
  );

  var htmlVisited = DS.renderDSComponent({
    dsSlug: "link",
    variant: "State=Visited",
    props: { Label: "View details" },
  });
  assert.match(htmlVisited, /ds-link--visited/, "carries the visited modifier");
});

test("link: escapes a hostile Label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "link",
    variant: "State=Default",
    props: { Label: "<script>alert(1)</script>" },
  });
  assert.match(html, /&lt;script&gt;/, "label escaped");
  assert.doesNotMatch(html, /<script>alert/, "no raw injection");
});

test("avatar: base class + initials slot, defaults to AV", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "avatar",
    variant: "Type=Default",
    props: { Initials: "CF" },
  });
  assert.match(html, /class="ds-avatar"/, "carries the base class");
  assert.match(
    html,
    /<span class="ds-avatar__initials">CF<\/span>/,
    "renders the initials",
  );

  var htmlDefault = DS.renderDSComponent({
    dsSlug: "avatar",
    variant: "Type=Default",
    props: {},
  });
  assert.match(
    htmlDefault,
    /<span class="ds-avatar__initials">AV<\/span>/,
    "defaults to AV when Initials is absent",
  );
});

test("avatar: Type=One group emits a group wrapper with a +N overflow; State=Disabled dims", function () {
  var DS = require(DS_PATH);
  var htmlGroup = DS.renderDSComponent({
    dsSlug: "avatar",
    variant: "Type=One group",
    props: { Initials: "CF", Count: "6" },
  });
  assert.match(htmlGroup, /ds-avatar-group/, "carries the group wrapper");
  var childMatches = htmlGroup.match(/class="ds-avatar"/g) || [];
  assert.ok(childMatches.length > 1, "more than one child avatar");
  assert.match(
    htmlGroup,
    /ds-avatar__overflow">\+2</,
    "shows +2 overflow for Count=6",
  );

  var htmlDisabled = DS.renderDSComponent({
    dsSlug: "avatar",
    variant: "Type=Default, State=Disabled",
    props: { Initials: "CF" },
  });
  assert.match(
    htmlDisabled,
    /ds-avatar--disabled/,
    "State=Disabled carries the modifier",
  );
});

test("avatar: escapes hostile Initials", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "avatar",
    variant: "Type=Default",
    props: { Initials: "<img src=x onerror=alert(1)>" },
  });
  assert.match(html, /&lt;img/, "initials escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("collapse-accordion: State=Collapsed renders Title, hides --expanded and __body", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "collapse-accordion",
    variant: "State=Collapsed",
    props: { Title: "Advanced settings" },
  });
  assert.match(html, /class="ds-collapse-accordion"/, "carries the base class");
  assert.match(
    html,
    /ds-collapse-accordion__title">Advanced settings/,
    "renders the title",
  );
  assert.doesNotMatch(
    html,
    /ds-collapse-accordion--expanded/,
    "collapsed does not carry the expanded modifier",
  );
  assert.doesNotMatch(
    html,
    /ds-collapse-accordion__body/,
    "collapsed hides the body",
  );
});

test('collapse-accordion: State="Expanede" (registry typo) matches -- expanded modifier + body render', function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "collapse-accordion",
    variant: "State=Expanede",
    props: { Title: "T", Body: "Hidden detail" },
  });
  assert.match(
    html,
    /ds-collapse-accordion--expanded/,
    "the literal registry value 'Expanede' matches the expanded check",
  );
  assert.match(
    html,
    /ds-collapse-accordion__body">Hidden detail/,
    "renders the body",
  );
});

test("collapse-accordion: escapes a hostile Title", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "collapse-accordion",
    variant: "State=Collapsed",
    props: { Title: "<img src=x onerror=alert(1)>" },
  });
  assert.match(html, /&lt;img/, "title escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("family 5: no silent no-op modifiers among the new primitive classes", function () {
  // Same audit shape as the family-4 no-op guard above: a root/descendant
  // modifier rule is real only when its body carries an actual declaration,
  // not just a comment. Covers every --modifier / .is-* rule the six new
  // primitives introduce.
  var css = require("node:fs").readFileSync(
    require("node:path").join(
      __dirname,
      "../../components/render/renderer/ds-base.css",
    ),
    "utf8",
  );
  var ruleRe =
    /\.(ds-spinner|ds-loading-skeleton|ds-scroll-bar|ds-link|ds-avatar|ds-collapse-accordion)(--[a-z0-9-]+|\.is-[a-z0-9-]+)\s*(?:\.[a-zA-Z0-9_-]+\s*)?\{([^}]*)\}/g;
  var checked = [];
  var match;
  while ((match = ruleRe.exec(css)) !== null) {
    var selector = match[0].slice(0, match[0].indexOf("{")).trim();
    var body = match[3];
    var bodyWithoutComments = body.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    checked.push(selector);
    assert.ok(
      bodyWithoutComments.length > 0 && /:/.test(bodyWithoutComments),
      selector +
        " must contain at least one real CSS declaration, not just a comment",
    );
  }
  assert.ok(
    checked.length >= 6,
    "audit found modifier rules across the six new primitives, found: " +
      JSON.stringify(checked),
  );
});

// ---------------------------------------------------------------------------
// alert-banner: the renderer's severity vocabulary must be the one the registry
// publishes. Figma publishes Type = Info | Success | Warning | Error; the map
// below used to be keyed Primary | Success | Warning | Danger, so `Error` missed
// the lookup and hit the XSS clamp that falls back to "primary". The result was
// an error alert wearing the info colour, the info glyph, and role="status"
// instead of role="alert" -- a silent accessibility defect no gate could see,
// because a clamp is indistinguishable from a deliberate default.
//
// The stub icon map makes the glyph choice assertable: without it renderIcon
// resolves nothing and the two severities are indistinguishable in the markup.
var ALERT_ICON_STUB = {
  "info-filled": { viewBox: "0 0 24 24", body: '<path d="INFO-GLYPH"/>' },
  "error-filled": { viewBox: "0 0 24 24", body: '<path d="ERROR-GLYPH"/>' },
  "success-filled": { viewBox: "0 0 24 24", body: '<path d="SUCCESS-GLYPH"/>' },
  "warning-filled": { viewBox: "0 0 24 24", body: '<path d="WARNING-GLYPH"/>' },
};

function renderAlert(typeValue) {
  var DS = require(DS_PATH);
  DS.setIcons(ALERT_ICON_STUB);
  try {
    return DS.renderDSComponent({
      dsSlug: "alert-banner",
      variant: "Type=" + typeValue,
      props: { Message: "Connection lost." },
    });
  } finally {
    DS.setIcons(null);
  }
}

test("alert-banner: Type=Error renders the danger treatment and role=alert", function () {
  var html = renderAlert("Error");
  assert.match(
    html,
    /class="ds-alert ds-alert--danger"/,
    'Error must resolve to the danger modifier the stylesheet defines, not "primary"',
  );
  assert.match(
    html,
    /role="alert"/,
    'an error alert must be announced assertively, not with role="status"',
  );
  assert.match(html, /ERROR-GLYPH/, "Error must carry the error-filled icon");
});

test("alert-banner: Type=Info keeps the primary treatment and role=status", function () {
  var html = renderAlert("Info");
  assert.match(html, /class="ds-alert ds-alert--primary"/);
  assert.match(html, /role="status"/);
  assert.match(html, /INFO-GLYPH/, "Info must carry the info-filled icon");
});

test("alert-banner: a Type the registry does not publish still clamps to primary", function () {
  // The clamp exists so a crafted variant value cannot break out of the class
  // attribute. Widening the vocabulary must not widen what reaches the class.
  var html = renderAlert('x"><script>alert(1)</script>');
  assert.match(html, /class="ds-alert ds-alert--primary"/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
