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

// Variant of fakeRest for a node Figma simply has no render for: getImages
// returns an `images` map that omits the requested id entirely (this is the
// real shape Figma's /v1/images endpoint uses to report "no url" for a node,
// distinct from an API error).
function fakeRestMissingIds(bodies, missingIds) {
  return {
    getImages: function (key, ids) {
      var images = {};
      ids.forEach(function (id) {
        if (missingIds.indexOf(id) === -1) images[id] = "https://x/" + id;
      });
      return Promise.resolve({ images: images });
    },
    fetchBinary: function (url) {
      var id = url.split("/").pop();
      return Promise.resolve(Buffer.from(bodies[id], "utf8"));
    },
  };
}

// Variant of fakeRest where fetchBinary rejects for specific ids, simulating a
// network failure fetching the rendered SVG body after Figma handed back a url.
function fakeRestThrowingFetch(bodies, throwIds) {
  return {
    getImages: function (key, ids) {
      var images = {};
      ids.forEach(function (id) { images[id] = "https://x/" + id; });
      return Promise.resolve({ images: images });
    },
    fetchBinary: function (url) {
      var id = url.split("/").pop();
      if (throwIds.indexOf(id) !== -1) {
        return Promise.reject(new Error("network error fetching " + id));
      }
      return Promise.resolve(Buffer.from(bodies[id], "utf8"));
    },
  };
}

// The shared invariant across every degrade path: a slug named in the input
// artworkMap must land in exactly one of exported / degraded. Never both,
// never neither (neither means it silently vanished from the run).
function assertEverySlugAccountedFor(artworkMap, out) {
  var exportedSet = {};
  out.exported.forEach(function (slug) { exportedSet[slug] = true; });
  var degradedSet = {};
  out.degraded.forEach(function (d) { degradedSet[d.slug] = true; });
  Object.keys(artworkMap).forEach(function (slug) {
    var inExported = !!exportedSet[slug];
    var inDegraded = !!degradedSet[slug];
    assert.ok(
      inExported || inDegraded,
      slug + " is missing from both exported and degraded (silently dropped)",
    );
    assert.ok(
      !(inExported && inDegraded),
      slug + " appears in both exported and degraded",
    );
  });
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

test("an all-degraded run never invokes the clean-file write (protects a prior good export)", async function () {
  // This is a data-loss guard: a transient Figma failure that degrades every
  // node must NOT wipe a previously good graphics-svg.auto.json. The
  // mechanism (per the source) is that the clean-file write is only called
  // when sortedSlugs.length > 0; with zero clean slugs that call never
  // happens at all, so a prior good export on disk is left untouched.
  //
  // AUTO_OUT_PATH / DEGRADED_OUT_PATH are fixed constants computed from
  // __dirname in the source (not parameterized by opts), so there is no way
  // to redirect them to a scratch location. Running with write:true would
  // write real files under components/src and components/dist. So instead
  // this test runs with write:true but stubs fs.existsSync/mkdirSync/
  // writeFileSync for its duration (restored in finally before any
  // assertion runs), which exercises the real guard logic while never
  // touching the real filesystem. A plain write:false run would make
  // out.wrote trivially false regardless of this guard (the whole write
  // block is skipped), which would not actually exercise the mechanism -
  // this is the "observable signal" instead: whether fs.writeFileSync was
  // ever called for the auto (clean) path.
  var fs = require("node:fs");
  var realExistsSync = fs.existsSync;
  var realMkdirSync = fs.mkdirSync;
  var realWriteFileSync = fs.writeFileSync;
  var writeCalls = [];
  fs.existsSync = function () { return false; };
  fs.mkdirSync = function () {};
  fs.writeFileSync = function (p) { writeCalls.push(p); };

  var artworkMap = {
    "actian-pyramid": "1:1",
    "illustration-empty-state": "2:1",
    "illustration-error-state": "2:2",
  };
  var bodies = {
    "1:1": '<svg viewBox="0 0 10 10"><image href="data:image/png;base64,AA=="/></svg>',
    "2:1": '<svg viewBox="0 0 10 10"><image href="data:image/png;base64,AA=="/></svg>',
    "2:2": '<svg viewBox="0 0 10 10"><image href="data:image/png;base64,AA=="/></svg>',
  };
  var out;
  try {
    out = await run({
      fileKey: "KEY",
      artworkMap: artworkMap,
      rest: fakeRest(bodies),
      write: true,
    });
  } finally {
    fs.existsSync = realExistsSync;
    fs.mkdirSync = realMkdirSync;
    fs.writeFileSync = realWriteFileSync;
  }

  assert.deepEqual(out.exported, []);
  assert.deepEqual(out.degraded, [
    { slug: "actian-pyramid", reason: "raster-backed" },
    { slug: "illustration-empty-state", reason: "raster-backed" },
    { slug: "illustration-error-state", reason: "raster-backed" },
  ]);
  assertEverySlugAccountedFor(artworkMap, out);

  var autoWrites = writeCalls.filter(function (p) {
    return p.indexOf("graphics-svg.auto.json") !== -1;
  });
  assert.deepEqual(
    autoWrites,
    [],
    "the clean-file write must never be called on an all-degraded run",
  );

  // The degraded worklist is still written even when empty of clean
  // entries, per the source comment, so a stale prior worklist never
  // lingers. This confirms the guard is specific to the clean file, not a
  // blanket "write nothing" fallback.
  var degradedWrites = writeCalls.filter(function (p) {
    return p.indexOf("graphics.degraded.json") !== -1;
  });
  assert.equal(degradedWrites.length, 1);
});

test("a node with no image URL degrades as render-failed, not silently dropped", async function () {
  var artworkMap = {
    "actian-pyramid": "1:1",
    "zeenea-logo": "2:1",
  };
  var bodies = {
    "1:1": '<svg viewBox="0 0 40 40"><path fill="#0F5FDC" d="M0 0h1v1H0z"/></svg>',
    // "2:1" deliberately has no body: getImages will omit its id from the
    // returned images map, simulating Figma returning no render URL.
  };
  var out = await run({
    fileKey: "KEY",
    artworkMap: artworkMap,
    rest: fakeRestMissingIds(bodies, ["2:1"]),
    write: false,
  });
  assert.deepEqual(out.exported, ["actian-pyramid"]);
  assert.deepEqual(out.degraded, [{ slug: "zeenea-logo", reason: "render-failed" }]);
  assertEverySlugAccountedFor(artworkMap, out);
});

test("a fetchBinary rejection degrades only that slug; run() still resolves", async function () {
  var artworkMap = {
    "actian-pyramid": "1:1",
    "zeenea-logo": "2:1",
  };
  var bodies = {
    "1:1": '<svg viewBox="0 0 40 40"><path fill="#0F5FDC" d="M0 0h1v1H0z"/></svg>',
    "2:1": '<svg viewBox="0 0 40 40"><path fill="#1B7F3B" d="M0 0h1v1H0z"/></svg>',
  };
  var out = await run({
    fileKey: "KEY",
    artworkMap: artworkMap,
    rest: fakeRestThrowingFetch(bodies, ["2:1"]),
    write: false,
  });
  assert.deepEqual(out.exported, ["actian-pyramid"]);
  assert.deepEqual(out.degraded, [{ slug: "zeenea-logo", reason: "render-failed" }]);
  assertEverySlugAccountedFor(artworkMap, out);
});
