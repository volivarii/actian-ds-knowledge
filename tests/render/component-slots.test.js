"use strict";
// #638 part 2: the slots Figma documents that the renderer had no markup for.
//
// Checked against components/dist/media/<slug>/default.webp, the isolated
// default-variant capture — the oracle the editor's render panel compares
// against since #637:
//
//   alert-banner  [i] Info ......................... Button  ×
//   action-bar    (Delete) ................... Cancel  (Save)
//   breadcrumb    Home › … › [Ds] Link › … › [Ds] Current page
//
// Two of the three are not invention: alert-banner publishes `Show Icon`,
// `Show close button` and `Show action` as default-TRUE BOOLEAN component
// properties in the registry, and breadcrumb publishes `digram-item-types` as a
// nested component. The renderer implemented none of them.
//
// Every slot is OPTIONAL at the markup level and only the published booleans
// default on. A specimen that fills a slot is not a runtime default: filling
// thirteen of them for the gallery is what removed a component's ability to
// render without its optional parts (the specimen-vs-runtime defect behind
// #543-#545).
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var DS = require("../../components/render/renderer/html-renderers/ds-html-map.js");
var CSS = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "..",
    "components",
    "render",
    "renderer",
    "ds-base.css",
  ),
  "utf8",
);

function render(slug, props, variant) {
  return DS.renderDSComponent({
    dsSlug: slug,
    variant: variant || "",
    props: props || {},
  });
}

// --- alert-banner ----------------------------------------------------------

test("alert-banner renders the dismiss its registry publishes as default-on", function () {
  var html = render("alert-banner", { Message: "Info" }, "Type=Info");
  assert.match(html, /class="ds-alert__actions"/);
  assert.match(html, /class="ds-alert__close"/);
});

test("alert-banner renders an action when the caller names one", function () {
  var html = render(
    "alert-banner",
    { Message: "Info", Action: "Retry" },
    "Type=Info",
  );
  // An ordinary DS button, not a bespoke element: it needs no positional CSS of
  // its own, and this repo does not emit a class with no rule behind it.
  assert.match(html, /class="ds-button ds-button--tertiary">Retry</);
});

test("alert-banner invents no action label for a caller who names none", function () {
  // Figma's own default reads "Button", which is placeholder text. Defaulting
  // to it here would hand that word to every caller who asked for no optional
  // parts — the specimen-vs-runtime defect the sparse-render ratchet blocks.
  var html = render("alert-banner", { Message: "Info" }, "Type=Info");
  assert.equal(/ds-button--tertiary/.test(html), false);
  assert.match(html, /ds-alert__close/, "the dismiss still renders");
});

test("alert-banner's dismiss carries an accessible name", function () {
  var html = render("alert-banner", {}, "Type=Info");
  assert.match(html, /class="ds-alert__close"[^>]*aria-label="Dismiss"/);
});

test("alert-banner drops the action when the published boolean is off", function () {
  var html = render(
    "alert-banner",
    { "Show action": false, Action: "Retry" },
    "Type=Info",
  );
  assert.equal(/>Retry</.test(html), false);
  assert.match(html, /class="ds-alert__close"/, "dismiss is unaffected");
});

test("alert-banner drops the dismiss when the published boolean is off", function () {
  var html = render(
    "alert-banner",
    { "Show close button": false, Action: "Retry" },
    "Type=Info",
  );
  assert.equal(/ds-alert__close/.test(html), false);
  assert.match(html, />Retry</, "the action is unaffected");
});

test("alert-banner drops the whole actions group when both booleans are off", function () {
  var html = render(
    "alert-banner",
    { "Show action": false, "Show close button": false },
    "Type=Info",
  );
  assert.equal(/ds-alert__actions/.test(html), false);
});

test("alert-banner drops the icon when the published boolean is off", function () {
  var html = render("alert-banner", { "Show Icon": false }, "Type=Info");
  assert.equal(/ds-alert__icon/.test(html), false);
  assert.match(html, /ds-alert__message/, "the message is unaffected");
});

test("alert-banner accepts the un-aliased Figma property key too", function () {
  // normalizeProps strips the #id suffix, so a flow authored against the raw
  // Figma key reaches the same branch as the base name.
  var html = render(
    "alert-banner",
    { "Show close button#14881:5": false },
    "Type=Info",
  );
  assert.equal(/ds-alert__close/.test(html), false);
});

// --- action-bar ------------------------------------------------------------

test("action-bar pins a destructive action to the leading edge when one is given", function () {
  var html = render("action-bar", { Destructive: "Delete" });
  assert.match(html, /class="ds-action-bar__leading"/);
  assert.match(html, /ds-button--critical-secondary">Delete</);
  assert.ok(
    html.indexOf("ds-action-bar__leading") <
      html.indexOf("ds-action-bar__actions"),
    "the leading slot precedes the trailing actions",
  );
});

test("action-bar renders no leading slot when no destructive action is given", function () {
  var html = render("action-bar", {});
  assert.equal(/ds-action-bar__leading/.test(html), false);
  assert.match(html, /ds-action-bar__actions/);
});

// --- breadcrumb ------------------------------------------------------------

test("breadcrumb gives each crumb the leading badge its nested component supplies", function () {
  // Array form: parseItems drops empty entries, so only an array can say the
  // first crumb has no badge — which is what the default capture shows.
  var html = render("breadcrumb", {
    Items: "Home, Link, Current page",
    Badges: ["", "Ds", "Ds"],
    BadgeType: "Dataset",
  });
  var badges = html.match(/class="ds-item-type[^"]*"/g) || [];
  assert.equal(badges.length, 2, "two of the three crumbs carry a badge");
  assert.ok(
    html.indexOf(">Home<") > 0,
    "the un-badged first crumb renders with no badge inside it",
  );
  assert.match(
    html,
    /background:#cfeafd/,
    "the badge takes the item type it was given, not the fallback",
  );
});

test("breadcrumb also accepts the comma-string badge form flows author", function () {
  var html = render("breadcrumb", {
    Items: "Home, Link, Page",
    Badges: "Ds, Ds",
  });
  assert.equal((html.match(/class="ds-item-type[^"]*"/g) || []).length, 2);
});

test("breadcrumb renders no badges when none are given", function () {
  var html = render("breadcrumb", { Items: "Home, Section, Page" });
  assert.equal(/ds-item-type/.test(html), false);
});

test("breadcrumb renders an overflow crumb when the path is elided", function () {
  var html = render("breadcrumb", { Items: "Home, …, Section, Page" });
  assert.match(html, /<a class="ds-breadcrumbs__crumb">…<\/a>/);
});

// --- the rule this repo already keeps: no modifier without a CSS delta ------

test("every class the new slots emit has a rule in ds-base.css", function () {
  var emitted = [
    render("alert-banner", { Message: "Info", Action: "Retry" }, "Type=Info"),
    render("action-bar", { Destructive: "Delete" }),
    render("breadcrumb", { Items: "Home, Link, Page", Badges: ", Ds, Ds" }),
  ].join("");
  var classes = {};
  (emitted.match(/class="([^"]*)"/g) || []).forEach(function (attr) {
    attr
      .slice(7, -1)
      .split(/\s+/)
      .forEach(function (c) {
        if (c) classes[c] = true;
      });
  });
  var names = Object.keys(classes);
  assert.ok(names.length >= 10, "classes found: " + names.length);
  // Strip comments first: a rule here is routinely preceded by a /* note */,
  // and a selector match run over the raw text swallows the note.
  var css = CSS.replace(/\/\*[\s\S]*?\*\//g, " ");
  var unowned = names.filter(function (c) {
    return css.indexOf("." + c) === -1;
  });
  assert.deepEqual(unowned, [], "classes with no CSS rule: " + unowned);
});
