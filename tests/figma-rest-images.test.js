"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var http = require("http");
var rest = require("../scripts/sync/figma-rest.js");

function startMock(handler) {
  return new Promise(function (resolve) {
    var srv = http.createServer(handler);
    srv.listen(0, "127.0.0.1", function () {
      resolve(srv);
    });
  });
}

// getImages goes through request() which requires FIGMA_PAT. Set a stub so
// the auth header builder doesn't throw before our mock server sees the call.
process.env.FIGMA_PAT = process.env.FIGMA_PAT || "test-pat";

test("getImages builds /v1/images URL with ids + format + scale", async function () {
  var captured = null;
  var server = await startMock(function (req, res) {
    captured = req.url;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        err: null,
        images: { "1:2": "https://example/sig/abc.png" },
      }),
    );
  });
  var port = server.address().port;
  rest._setBaseUrl("http://127.0.0.1:" + port);
  try {
    var resp = await rest.getImages("FILEKEY", ["1:2"], {
      format: "png",
      scale: 2,
    });
    assert.ok(
      captured.indexOf("/v1/images/FILEKEY") !== -1,
      "URL: " + captured,
    );
    assert.ok(captured.indexOf("ids=1%3A2") !== -1, "URL: " + captured);
    assert.ok(captured.indexOf("format=png") !== -1, "URL: " + captured);
    assert.ok(captured.indexOf("scale=2") !== -1, "URL: " + captured);
    assert.equal(resp.images["1:2"], "https://example/sig/abc.png");
  } finally {
    server.close();
    rest._resetBaseUrl();
  }
});

test("fetchBinary returns a Buffer of the response body", async function () {
  var server = await startMock(function (req, res) {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
  var port = server.address().port;
  try {
    var buf = await rest.fetchBinary("http://127.0.0.1:" + port + "/x.png");
    assert.ok(Buffer.isBuffer(buf), "must return a Buffer");
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
  } finally {
    server.close();
  }
});

test("getImages rejects on empty id array", async function () {
  await assert.rejects(
    rest.getImages("FILEKEY", []),
    /non-empty nodeId array/i,
  );
});

test("fetchBinary surfaces HTTP errors", async function () {
  var server = await startMock(function (req, res) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  var port = server.address().port;
  try {
    await assert.rejects(
      rest.fetchBinary("http://127.0.0.1:" + port + "/missing.png"),
      /404/,
    );
  } finally {
    server.close();
  }
});
