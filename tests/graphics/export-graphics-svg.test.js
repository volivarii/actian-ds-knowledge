"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var { run } = require("../../scripts/graphics/export-graphics-svg.js");

// Mirrors the real figma-rest client the icon exporter uses: getImages(fileKey,
// ids, {format}) -> { images: {id: url} }, then fetchBinary(url) -> Buffer of the
// SVG. Read scripts/icons/export-icons-svg.js:64-116 to confirm these exact names.
function fakeRest(bodies) {
  return {
    getImages: function (key, ids) {
      var images = {};
      ids.forEach(function (id) { images[id] = "https://x/" + id; });
      return Promise.resolve({ images: images });
    },
    fetchBinary: function (url) {
      var id = url.split("/").pop();
      return Promise.resolve(Buffer.from(bodies[id], "utf8"));
    },
  };
}

test("exports each slug in the artwork map; flags a raster one to the worklist", async function () {
  var artworkMap = {
    "actian-pyramid": "1:1",
    "illustration-empty-state": "2:1",
    "illustration-error-state": "2:2",
  };
  var bodies = {
    "1:1": '<svg viewBox="0 0 40 40"><path fill="#0F5FDC" d="M0 0h1v1H0z"/></svg>',
    "2:1": '<svg viewBox="0 0 200 200"><path fill="#1B7F3B" d="M0 0h9v9H0z"/></svg>',
    "2:2": '<svg viewBox="0 0 10 10"><image href="data:image/png;base64,AA=="/></svg>',
  };
  var out = await run({
    fileKey: "KEY",
    artworkMap: artworkMap,
    rest: fakeRest(bodies),
    write: false,
  });
  assert.deepEqual(out.exported.sort(), ["actian-pyramid", "illustration-empty-state"]);
  assert.deepEqual(out.degraded, [{ slug: "illustration-error-state", reason: "raster-backed" }]);
});
