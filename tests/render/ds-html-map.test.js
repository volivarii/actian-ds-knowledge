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
