"use strict";
var fs = require("node:fs");
var path = require("node:path");
var deriveCanonical = require("./derive-canonical.js").deriveCanonical;
var selfContainedCard = require("./build-bundle.js").selfContainedCard;
var REPO = path.resolve(__dirname, "..", "..");
var MEDIA = path.join(REPO, "components", "dist", "media");

function oracleImg(slug, name) {
  var p = path.join(MEDIA, slug, name + ".webp");
  if (!fs.existsSync(p)) return null;
  return "data:image/webp;base64," + fs.readFileSync(p).toString("base64");
}

function buildContactSheet(outPath) {
  var canonical = deriveCanonical();
  // The renderer-relocation slice retired the source:"derived" templates, so the
  // sign-off set is now a fixed list of the slugs whose rendering this slice
  // changed (tag-default colors; checkbox/radio/toggle state). Each renders
  // through the generic renderer and is shown beside its Figma media oracle.
  var SIGN_OFF_SLUGS = ["tag-default", "checkbox", "radio-button", "toggle"];
  var signOff = canonical.manifest.renders.filter(function (r) {
    return SIGN_OFF_SLUGS.indexOf(r.slug) >= 0;
  });
  var sections = signOff
    .map(function (r) {
      var card = selfContainedCard(
        canonical.css,
        canonical.pageCss,
        canonical.fragments[r.slug],
        r.group,
      );
      var render =
        '<iframe style="width:520px;height:220px;border:1px solid #ddd" srcdoc="' +
        card.replace(/"/g, "&quot;") +
        '"></iframe>';
      var oracle = oracleImg(r.slug, "preview") || oracleImg(r.slug, "default");
      var oracleHtml = oracle
        ? '<img src="' +
          oracle +
          '" style="max-width:520px;border:1px solid #ddd" alt="oracle">'
        : '<p style="color:#a00">no media oracle for ' + r.slug + "</p>";
      return (
        "<section><h2>" +
        r.slug +
        " (" +
        r.source +
        ")</h2>" +
        '<div style="display:flex;gap:24px;align-items:flex-start"><div><h3>derived render</h3>' +
        render +
        "</div><div><h3>Figma oracle</h3>" +
        oracleHtml +
        "</div></div></section>"
      );
    })
    .join("");
  var page =
    "<!doctype html><meta charset=utf-8><title>Render fidelity contact sheet</title>" +
    '<body style="font-family:system-ui;margin:24px"><h1>Derived renders vs Figma oracles</h1>' +
    sections +
    "</body>";
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, page);
  return signOff.map(function (r) {
    return r.slug;
  });
}

if (require.main === module) {
  var out =
    process.argv[2] ||
    path.join(
      REPO,
      "components",
      "render",
      "dist",
      "bundle",
      "contact-sheet.html",
    );
  var slugs = buildContactSheet(out);
  process.stdout.write(
    "contact sheet -> " + out + " (" + slugs.length + " sign-off slugs)\n",
  );
}

module.exports = { buildContactSheet: buildContactSheet, oracleImg: oracleImg };
