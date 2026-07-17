"use strict";
var bindColor = require("../derive-appearance.js").bindColor;

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function template(facts, ctx) {
  var map = ctx.tokenMap;
  var colors = facts.variants.filter(function (v) { return v.prop === "Color"; });
  var css = colors.map(function (v) {
    var slug = String(v.values[0]).toLowerCase();
    var rules = ["background:" + bindColor(v.background, v.backgroundToken, map)];
    if (v.border) rules.push("border-color:" + bindColor(v.border.color, v.border.colorToken, map));
    return ".ds-tag--" + slug + "{" + rules.join(";") + "}";
  }).join("\n");
  var cells = colors.map(function (v) {
    var slug = String(v.values[0]).toLowerCase();
    var label = esc(v.values[0]);
    return '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">' +
      '<span class="ds-tag ds-tag--' + slug + '">' + label + "</span>" +
      '<span style="font:12px/1.4 sans-serif;opacity:0.55">' + label + "</span></div>";
  }).join("");
  var fragment = '<div id="fidelity-root" data-slug="tag-default">' +
    '<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">' + cells + "</div></div>";
  return { fragment: fragment, css: css };
}

module.exports = { template: template };
