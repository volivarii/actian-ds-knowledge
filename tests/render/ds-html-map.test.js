"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

var DS_PATH = "../../components/render/renderer/html-renderers/ds-html-map.js";

test("digram-item-types: known color, no token, renders initials", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "digram-item-types",
    variant: "Item type=Dataset, Size=Default",
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

test("metamodel-widget: default Type (Dataset) border color, Show Section off", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "metamodel-widget",
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
    /ds-metamodel-widget__section"/,
    "no section when Show Section is falsy",
  );
  assert.match(html, />customer</, "renders the title");
});

test("metamodel-widget: Type=Data Process has no captured token, bare hex", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "metamodel-widget",
    variant: "Type=Data Process",
    props: { Title: "etl_job" },
  });
  assert.match(
    html,
    /border-color:#a82743"/,
    "Data Process' captured border, no token",
  );
});

test("metamodel-widget: Show Section renders the collapsible section", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "metamodel-widget",
    variant: "Type=Field",
    props: {
      Title: "email",
      "Show Section": true,
      "Section body": "Validated, unique",
    },
  });
  assert.match(
    html,
    /ds-metamodel-widget__section"/,
    "section renders when Show Section is truthy",
  );
  assert.match(html, />Validated, unique</, "renders the section body");
});

test("metamodel-widget: escapes a hostile Title", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "metamodel-widget",
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

// ---- Gray-box-to-zero, family 2 (tag family) ----

test("tag-shared: base + modifier present, no color-modifier leak", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-shared",
    variant: "",
    props: {},
  });
  assert.match(
    html,
    /class="ds-tag ds-tag--shared"/,
    "carries base + modifier",
  );
});

test("tag-shared: default label is Shared", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-shared",
    variant: "",
    props: {},
  });
  assert.match(html, />Shared</, "renders the anatomy's fixed label");
});

test("tag-shared: escapes hostile Label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-shared",
    variant: "",
    props: { Label: "<script>alert(1)</script>" },
  });
  assert.doesNotMatch(html, /<script/, "no raw script injection");
  assert.match(html, /&lt;script&gt;/, "label escaped");
});

test("tag-catalog: base + modifier present", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-catalog",
    variant: "Type=Default",
    props: {},
  });
  assert.match(
    html,
    /class="ds-tag ds-tag--catalog"/,
    "carries base + modifier",
  );
});

test("tag-catalog: leading icon slot present and resolved", function () {
  var DS = require(DS_PATH);
  DS.setIcons(require("../../components/dist/icons/icons.json").icons);
  try {
    var html = DS.renderDSComponent({
      dsSlug: "tag-catalog",
      variant: "Type=Default",
      props: {},
    });
    assert.match(
      html,
      /<span class="ds-tag__icon"><svg class="ds-icon"[^>]*>.+?<\/svg><\/span>/,
      "ds-tag__icon wraps a non-empty svg (directory resolves)",
    );
  } finally {
    DS.setIcons(null);
  }
});

test("tag-catalog: default label, escapes hostile Label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-catalog",
    variant: "Type=Default",
    props: {},
  });
  assert.match(html, />Catalog</, "default label from anatomy");

  var hostile = DS.renderDSComponent({
    dsSlug: "tag-catalog",
    variant: "Type=Default",
    props: { Label: "<img src=x onerror=alert(1)>" },
  });
  assert.match(hostile, /&lt;img/, "label escaped");
  assert.doesNotMatch(hostile, /<img src=x/, "no raw injection");
});

test("tag-stage: base structure, dot, label, trailing arrow icon", function () {
  var DS = require(DS_PATH);
  DS.setIcons(require("../../components/dist/icons/icons.json").icons);
  try {
    var html = DS.renderDSComponent({
      dsSlug: "tag-stage",
      variant: "Color=Gray",
      props: { Label: "Raw" },
    });
    assert.match(
      html,
      /class="ds-tag ds-tag-stage ds-tag--gray"/,
      "carries base + tag-stage + color modifier",
    );
    assert.match(
      html,
      /<span class="ds-tag-stage__dot"><\/span>/,
      "renders the leading dot",
    );
    assert.match(html, />Raw</, "renders the label");
    assert.match(
      html,
      /<span class="ds-tag-stage__icon"><svg class="ds-icon"[^>]*>.+?<\/svg><\/span>/,
      "trailing icon resolves (arrow-down)",
    );
  } finally {
    DS.setIcons(null);
  }
});

test("tag-stage: Color=Indigo activates the indigo modifier", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-stage",
    variant: "Color=Indigo",
    props: { Label: "Building" },
  });
  assert.match(html, /ds-tag--indigo/, "root carries the indigo modifier");
});

test("tag-stage: escapes hostile Label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-stage",
    variant: "Color=Gray",
    props: { Label: "<img src=x onerror=alert(1)>" },
  });
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
  assert.match(html, /&lt;img/, "label escaped");
});

test("tag-stage: clamps a hostile Color before it reaches the class attribute (XSS)", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-stage",
    variant: 'Color="><script>alert(1)</script>',
    props: { Label: "Raw" },
  });
  assert.doesNotMatch(
    html,
    /"><script/,
    "no raw class-attribute breakout from an unclamped Color",
  );
  assert.match(
    html,
    /class="ds-tag ds-tag-stage"/,
    "unknown Color appends no modifier -- renders the base pill safely",
  );
});

test("tag-status: base + namespace present", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-status",
    variant: "Status=Fail",
    props: {},
  });
  assert.match(html, /class="[^"]*\bds-tag\b/, "carries the ds-tag class");
  assert.match(
    html,
    /class="[^"]*\bds-tag--status\b/,
    "carries the ds-tag--status namespace class",
  );
});

test("tag-status: grouped family mapping from the anatomy", function () {
  var DS = require(DS_PATH);
  var successHtml = DS.renderDSComponent({
    dsSlug: "tag-status",
    variant: "Status=Success",
    props: {},
  });
  assert.match(
    successHtml,
    /ds-tag--status-success/,
    "Success maps to the success family",
  );
  assert.doesNotMatch(
    successHtml,
    /ds-tag--status-error/,
    "Success does not carry the error family",
  );

  var maintHtml = DS.renderDSComponent({
    dsSlug: "tag-status",
    variant: "Status=Maintenance",
    props: {},
  });
  assert.match(
    maintHtml,
    /ds-tag--status-info/,
    "Maintenance maps to the grouped info family, not a per-value class",
  );
});

test("tag-status: escapes hostile Label, falls back to Status when Label omitted", function () {
  var DS = require(DS_PATH);
  var hostile = DS.renderDSComponent({
    dsSlug: "tag-status",
    variant: "Status=Fail",
    props: { Label: "<img src=x onerror=alert(1)>" },
  });
  assert.doesNotMatch(hostile, /<img src=x/, "no raw injection");
  assert.match(hostile, /&lt;img/, "label escaped");

  var fallback = DS.renderDSComponent({
    dsSlug: "tag-status",
    variant: "Status=Warning",
    props: {},
  });
  assert.match(fallback, />Warning</, "Label falls back to the Status value");
});

test("tag-glossary-item-type: base + label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-glossary-item-type",
    variant: "Property 1=Default",
    props: {},
  });
  assert.match(
    html,
    /class="ds-tag-glossary-item-type"/,
    "carries the base class",
  );
  assert.match(
    html,
    /<span class="ds-tag-glossary-item-type__label">Glossary item<\/span>/,
    "renders the __label span with the anatomy default text",
  );
});

test("tag-glossary-item-type: counter toggle", function () {
  var DS = require(DS_PATH);
  var withCounter = DS.renderDSComponent({
    dsSlug: "tag-glossary-item-type",
    variant: "Property 1=Default",
    props: { "Show Counter": true, Counter: "7" },
  });
  assert.match(
    withCounter,
    /<span class="ds-tag-glossary-item-type__counter">7<\/span>/,
    "counter renders when Show Counter is truthy",
  );

  var withoutCounter = DS.renderDSComponent({
    dsSlug: "tag-glossary-item-type",
    variant: "Property 1=Default",
    props: {},
  });
  assert.doesNotMatch(
    withoutCounter,
    /ds-tag-glossary-item-type__counter/,
    "no counter span when Show Counter is absent/false",
  );
});

test("tag-glossary-item-type: escapes hostile Label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-glossary-item-type",
    variant: "Property 1=Default",
    props: { Label: "<img src=x onerror=alert(1)>" },
  });
  assert.match(html, /&lt;img/, "label escaped");
  assert.doesNotMatch(html, /<img src=x/, "no raw injection");
});

test("tag-catalog-item-type: base + default Category modifier + label", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "tag-catalog-item-type",
    variant: "Type=Category",
    props: { Label: "Category" },
  });
  assert.match(html, /ds-tag-catalog-item-type/, "carries the base class");
  assert.match(
    html,
    /ds-tag-catalog-item-type--category/,
    "carries the category modifier",
  );
  assert.match(html, />Category</, "renders the label");
});

test("tag-catalog-item-type: Type slugifies into the modifier class", function () {
  var DS = require(DS_PATH);
  var dataProcess = DS.renderDSComponent({
    dsSlug: "tag-catalog-item-type",
    variant: "Type=Data process",
    props: {},
  });
  assert.match(
    dataProcess,
    /ds-tag-catalog-item-type--data-process/,
    "Data process lowercases + hyphenates",
  );

  var useCase = DS.renderDSComponent({
    dsSlug: "tag-catalog-item-type",
    variant: "Type=Use case",
    props: {},
  });
  assert.match(
    useCase,
    /ds-tag-catalog-item-type--use-case/,
    "Use case lowercases + hyphenates",
  );
});

test("tag-catalog-item-type: counter gating and escapes hostile Label", function () {
  var DS = require(DS_PATH);
  var withCounter = DS.renderDSComponent({
    dsSlug: "tag-catalog-item-type",
    variant: "Type=Category",
    props: { "Show counter": true, Counter: "42" },
  });
  assert.match(
    withCounter,
    /<span class="ds-tag-catalog-item-type__counter">42<\/span>/,
    "counter renders when Show counter is truthy",
  );

  var withoutCounter = DS.renderDSComponent({
    dsSlug: "tag-catalog-item-type",
    variant: "Type=Category",
    props: {},
  });
  assert.doesNotMatch(
    withoutCounter,
    /ds-tag-catalog-item-type__counter/,
    "no counter span when Show counter is absent/false",
  );

  var hostile = DS.renderDSComponent({
    dsSlug: "tag-catalog-item-type",
    variant: "Type=Category",
    props: { Label: "<img src=x onerror=alert(1)>" },
  });
  assert.match(hostile, /&lt;img/, "label escaped");
  assert.doesNotMatch(hostile, /<img src=x/, "no raw injection");
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
  // tag-default) are intentionally not built for this leaf -- there is no
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

test("notification-dropdown: base class + role + item present (List)", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "notification-dropdown",
    variant: "Property 1=List",
    props: {},
  });
  assert.match(html, /class="ds-notification-menu"/, "carries the base class");
  assert.match(html, /role="menu"/, "carries menu role");
  assert.match(
    html,
    /ds-notification-menu__item/,
    "renders at least one item row",
  );
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

test("notification-dropdown: escapes hostile Items and Header", function () {
  var DS = require(DS_PATH);
  var html = DS.renderDSComponent({
    dsSlug: "notification-dropdown",
    variant: "Property 1=List",
    props: {
      Header: "<script>alert(1)</script>",
      Items: "<script>alert(2)</script>",
    },
  });
  assert.doesNotMatch(html, /<script>/, "no raw script tag");
  assert.match(html, /&lt;script&gt;/, "hostile text is escaped");
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
