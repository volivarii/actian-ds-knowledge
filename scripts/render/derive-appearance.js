"use strict";
var fs = require("node:fs");
var path = require("node:path");

function loadTokenMap(cssText) {
  var map = {};
  String(cssText).replace(
    /(--zen-[a-z0-9-]+)\s*:\s*([^;}]+)/gi,
    function (_, n, v) {
      if (!(n in map)) map[n] = v.trim();
      return _;
    },
  );
  return map;
}

function bindColor(value, token, tokenMap) {
  if (
    token &&
    tokenMap[token] &&
    tokenMap[token].toLowerCase() === String(value).toLowerCase()
  ) {
    return "var(" + token + ")";
  }
  return value;
}

function readAppearance(slug, anatomyDir) {
  var a = JSON.parse(
    fs.readFileSync(path.join(anatomyDir, slug + ".json"), "utf8"),
  );
  var root = a.root || a;
  var variants = [];
  var byNode = [];
  (function walk(n) {
    var app = n.appearance || {};
    byNode.push({ name: n.name || n.role || "?", appearance: app });
    (app.variants || []).forEach(function (v) {
      variants.push(v);
    });
    (n.children || []).forEach(walk);
  })(root);
  return { root: root.appearance || {}, variants: variants, byNode: byNode };
}

module.exports = {
  loadTokenMap: loadTokenMap,
  bindColor: bindColor,
  readAppearance: readAppearance,
};
