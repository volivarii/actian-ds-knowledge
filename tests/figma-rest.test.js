"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var figmaRest = require(
  path.join(__dirname, "..", "scripts", "sync", "figma-rest.js"),
);

// Mock globalThis.fetch with controlled latency so we can assert ordering
// + concurrency behavior. Each test sets FIGMA_PAT, installs a fetch stub,
// runs the call, then restores.
function withFetchMock(fn) {
  var origFetch = globalThis.fetch;
  var origPat = process.env.FIGMA_PAT;
  process.env.FIGMA_PAT = "test-pat";
  return Promise.resolve(fn())
    .finally(function () {
      globalThis.fetch = origFetch;
      if (origPat === undefined) delete process.env.FIGMA_PAT;
      else process.env.FIGMA_PAT = origPat;
    });
}

test("getNodes — empty array short-circuits without fetch", async function () {
  await withFetchMock(async function () {
    globalThis.fetch = function () {
      throw new Error("fetch should not be called for empty input");
    };
    var resp = await figmaRest.getNodes("filekey", []);
    assert.deepEqual(resp, { nodes: {} });
  });
});

test("getNodes — bounded concurrency runs batches in parallel (cap=2)", async function () {
  // 4 batches of 2 ids each; with concurrency=2 we expect ~2 batches in
  // flight at any time. Track in-flight count + max observed concurrency.
  var inFlight = 0;
  var maxInFlight = 0;
  var calls = 0;

  await withFetchMock(async function () {
    globalThis.fetch = function (url) {
      calls++;
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      return new Promise(function (resolve) {
        setTimeout(function () {
          inFlight--;
          // Parse the ids out of the URL so the mocked response reflects
          // the right node ids.
          var match = url.match(/ids=([^&]+)/);
          var ids = match ? decodeURIComponent(match[1]).split(",") : [];
          var nodes = {};
          ids.forEach(function (id) {
            nodes[id] = { document: { name: "node-" + id } };
          });
          resolve({
            ok: true,
            status: 200,
            json: function () {
              return Promise.resolve({ nodes: nodes });
            },
          });
        }, 20);
      });
    };

    var ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    var resp = await figmaRest.getNodes("filekey", ids, {
      batchSize: 2,
      concurrency: 2,
    });

    assert.equal(calls, 4, "exactly 4 batches dispatched (8 ids / 2 per batch)");
    assert.equal(
      maxInFlight,
      2,
      "max concurrent in-flight batches matches concurrency cap",
    );
    assert.equal(Object.keys(resp.nodes).length, 8, "all 8 ids merged");
    assert.equal(resp.nodes["a"].document.name, "node-a");
  });
});

test("getNodes — concurrency=1 reverts to fully sequential", async function () {
  var maxInFlight = 0;
  var inFlight = 0;
  await withFetchMock(async function () {
    globalThis.fetch = function (url) {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      return new Promise(function (resolve) {
        setTimeout(function () {
          inFlight--;
          var match = url.match(/ids=([^&]+)/);
          var ids = match ? decodeURIComponent(match[1]).split(",") : [];
          var nodes = {};
          ids.forEach(function (id) {
            nodes[id] = {};
          });
          resolve({
            ok: true,
            status: 200,
            json: function () {
              return Promise.resolve({ nodes: nodes });
            },
          });
        }, 10);
      });
    };

    await figmaRest.getNodes("filekey", ["a", "b", "c", "d"], {
      batchSize: 1,
      concurrency: 1,
    });
    assert.equal(maxInFlight, 1, "concurrency=1 stays sequential");
  });
});
