"use strict";

// Thin REST wrapper around the Figma file API. Used by sync-from-figma.js
// (Sprint 1+) to pull components, styles, and frame trees nightly.
//
// Auth: process.env.FIGMA_PAT (Personal Access Token, Pro tier sufficient for
// every endpoint exposed here — Variables API is the one Enterprise-gated
// endpoint and is intentionally NOT wrapped here).
//
// Retries: 5xx up to 3 times with exponential backoff (1s, 2s, 4s).
// 429 retried up to 3 times with longer exponential backoff (5s, 15s, 45s)
// to clear Figma's rate-limit window.
// 4xx (other than 429) throw immediately.

var DEFAULT_BASE = "https://api.figma.com";
var BASE = DEFAULT_BASE;
// Test helpers — let tests point the wrapper at a local HTTP mock so the
// /v1/images + signed-URL flow can be exercised without hitting Figma.
function _setBaseUrl(url) {
  BASE = url;
}
function _resetBaseUrl() {
  BASE = DEFAULT_BASE;
}
var DEFAULT_BACKOFF_DELAYS_MS = [1000, 2000, 4000]; // 5xx retries
var DEFAULT_RATE_LIMIT_BACKOFFS_MS = [5000, 15000, 45000]; // 429 retries
var MAX_5XX_RETRIES = 3;
var MAX_429_RETRIES = 3;

// Mutable to allow tests to set zeros for fast runs without sleeping.
var BACKOFF_DELAYS_MS = DEFAULT_BACKOFF_DELAYS_MS.slice();
var RATE_LIMIT_BACKOFFS_MS = DEFAULT_RATE_LIMIT_BACKOFFS_MS.slice();

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function authHeader() {
  var pat = process.env.FIGMA_PAT;
  if (!pat) {
    var err = new Error(
      "FIGMA_PAT environment variable is not set. Generate a Figma Personal Access Token and add it to plugins/actian-design-system/.env",
    );
    throw err;
  }
  return { "X-Figma-Token": pat };
}

function buildError(status, statusText, bodyText, url) {
  var msg =
    "Figma API request failed: " +
    status +
    " " +
    (statusText || "") +
    " (" +
    url +
    ")";
  if (bodyText) msg += " — " + bodyText.slice(0, 200);
  var err = new Error(msg);
  err.status = status;
  err.url = url;
  return err;
}

// Single network call with retry policy. Returns parsed JSON or throws.
// 5xx and 429 attempts are tracked independently so a flaky endpoint that
// returns 503 followed by 429 still gets the full retry budget for both.
function request(url) {
  var attempt5xx = 0;
  var attempt429 = 0;

  function attemptOnce() {
    var headers;
    try {
      headers = authHeader();
    } catch (e) {
      return Promise.reject(e);
    }

    return globalThis.fetch(url, { headers: headers }).then(function (res) {
      if (res.ok) {
        return res.json();
      }

      if (res.status === 429) {
        // Rate limited — exponential backoff retry up to MAX_429_RETRIES.
        if (attempt429 < MAX_429_RETRIES) {
          var rlDelay =
            RATE_LIMIT_BACKOFFS_MS[attempt429] !== undefined
              ? RATE_LIMIT_BACKOFFS_MS[attempt429]
              : RATE_LIMIT_BACKOFFS_MS[RATE_LIMIT_BACKOFFS_MS.length - 1];
          attempt429++;
          return sleep(rlDelay).then(attemptOnce);
        }
        return res.text().then(function (body) {
          throw buildError(429, res.statusText, body, url);
        });
      }

      if (res.status >= 500 && res.status < 600) {
        // 5xx — retry up to MAX_5XX_RETRIES with exponential backoff
        if (attempt5xx < MAX_5XX_RETRIES) {
          var delay =
            BACKOFF_DELAYS_MS[attempt5xx] !== undefined
              ? BACKOFF_DELAYS_MS[attempt5xx]
              : BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1];
          attempt5xx++;
          return sleep(delay).then(attemptOnce);
        }
        return res.text().then(function (body) {
          throw buildError(res.status, res.statusText, body, url);
        });
      }

      // 4xx (other than 429) — no retry
      return res.text().then(function (body) {
        throw buildError(res.status, res.statusText, body, url);
      });
    });
  }

  return attemptOnce();
}

// ---- Public surface ----

function getFile(fileKey, opts) {
  opts = opts || {};
  var depth = opts.depth === undefined ? 1 : opts.depth;
  var url = BASE + "/v1/files/" + encodeURIComponent(fileKey);
  // depth=0 = full tree (no param). depth>=1 = limit nesting.
  if (depth >= 1) url += "?depth=" + depth;
  return request(url);
}

// Default batch size for getNodes. Figma accepts comma-separated ids on the
// `/nodes?ids=...` endpoint; 50 keeps URL length comfortably under 8KB while
// reducing a 300-id sync from 300 calls to 6.
var DEFAULT_NODES_BATCH_SIZE = 50;

function getNode(fileKey, nodeId) {
  if (!nodeId) return Promise.reject(new Error("getNode requires a nodeId"));
  return getNodes(fileKey, [nodeId]);
}

// Default concurrency for getNodes batches. Empirically 3 parallel /nodes
// requests was enough to trigger 429s (per the original sequential-only
// comment). 2-way concurrency stays below that ceiling while halving
// wall-clock on large kits; if it still 429s the per-request retry handles
// it gracefully (5s/15s/45s backoff) at worst-case parity with sequential.
var DEFAULT_NODES_CONCURRENCY = 2;

// Fetch many nodes in batches. Returns merged `{ nodes: { id: payload, … } }`
// across batches. Batches are issued with bounded concurrency (default 2)
// to halve wall-clock vs fully sequential while staying under Figma's
// observed 3-parallel 429 threshold. opts.concurrency overrides (1 reverts
// to the historical fully-sequential behavior).
function getNodes(fileKey, nodeIds, opts) {
  if (!Array.isArray(nodeIds))
    return Promise.reject(new Error("getNodes requires an array of nodeIds"));
  if (nodeIds.length === 0) return Promise.resolve({ nodes: {} });

  opts = opts || {};
  var batchSize = opts.batchSize || DEFAULT_NODES_BATCH_SIZE;
  var concurrency = Math.max(1, opts.concurrency || DEFAULT_NODES_CONCURRENCY);

  var batches = [];
  for (var i = 0; i < nodeIds.length; i += batchSize) {
    batches.push(nodeIds.slice(i, i + batchSize));
  }

  function fetchBatch(batch) {
    var idsParam = batch.map(encodeURIComponent).join(",");
    var url =
      BASE +
      "/v1/files/" +
      encodeURIComponent(fileKey) +
      "/nodes?ids=" +
      idsParam;
    return request(url);
  }

  // Promise-pool with bounded concurrency. Each "worker" pulls the next
  // batch off a shared cursor and processes it; resolves when all batches
  // are drained. Preserves insertion order semantics in the merged map
  // (later batches overwrite earlier writes of the same id — same as the
  // sequential reduce behavior).
  var merged = {};
  var cursor = 0;

  function worker() {
    if (cursor >= batches.length) return Promise.resolve();
    var idx = cursor++;
    return fetchBatch(batches[idx])
      .then(function (resp) {
        var nodes = (resp && resp.nodes) || {};
        Object.keys(nodes).forEach(function (id) {
          merged[id] = nodes[id];
        });
      })
      .then(worker);
  }

  var workers = [];
  for (var w = 0; w < Math.min(concurrency, batches.length); w++) {
    workers.push(worker());
  }
  return Promise.all(workers).then(function () {
    return { nodes: merged };
  });
}

function getStyles(fileKey) {
  return request(BASE + "/v1/files/" + encodeURIComponent(fileKey) + "/styles");
}

function getComponents(fileKey) {
  return request(
    BASE + "/v1/files/" + encodeURIComponent(fileKey) + "/components",
  );
}

function getComponentSets(fileKey) {
  return request(
    BASE + "/v1/files/" + encodeURIComponent(fileKey) + "/component_sets",
  );
}

// Render Figma nodes as raster/vector images. Returns
// `{ err, images: { nodeId: signedUrl } }` — the signedUrl points at an S3
// blob that needs a separate plain-HTTPS fetch (see fetchBinary below).
function getImages(fileKey, nodeIds, opts) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
    return Promise.reject(
      new Error("getImages requires a non-empty nodeId array"),
    );
  }
  opts = opts || {};
  var format = opts.format || "png";
  var scale = opts.scale || 2;
  var idsParam = nodeIds.map(encodeURIComponent).join(",");
  var url =
    BASE +
    "/v1/images/" +
    encodeURIComponent(fileKey) +
    "?ids=" +
    idsParam +
    "&format=" +
    encodeURIComponent(format) +
    "&scale=" +
    encodeURIComponent(String(scale));
  return request(url);
}

// Plain HTTPS fetch — used after getImages() to download the signed S3 URL
// the Figma response points at. Returns a Buffer. Surfaces non-2xx as Error.
function fetchBinary(url) {
  return globalThis.fetch(url).then(function (res) {
    if (!res.ok) {
      throw new Error(
        "fetchBinary " + res.status + " " + res.statusText + " — " + url,
      );
    }
    return res.arrayBuffer().then(function (ab) {
      return Buffer.from(ab);
    });
  });
}

// Test helper — lets tests override backoff so the retry suite runs fast.
// `rateLimitDelay` accepts either a single number (applied to every 429 retry)
// or an array of per-attempt delays.
function _setBackoffDelays(delays, rateLimitDelay) {
  BACKOFF_DELAYS_MS = delays.slice();
  if (Array.isArray(rateLimitDelay)) {
    RATE_LIMIT_BACKOFFS_MS = rateLimitDelay.slice();
  } else if (typeof rateLimitDelay === "number") {
    RATE_LIMIT_BACKOFFS_MS = [rateLimitDelay, rateLimitDelay, rateLimitDelay];
  } else {
    RATE_LIMIT_BACKOFFS_MS = [0, 0, 0];
  }
}

function _resetBackoffDelays() {
  BACKOFF_DELAYS_MS = DEFAULT_BACKOFF_DELAYS_MS.slice();
  RATE_LIMIT_BACKOFFS_MS = DEFAULT_RATE_LIMIT_BACKOFFS_MS.slice();
}

module.exports = {
  getFile: getFile,
  getNode: getNode,
  getNodes: getNodes,
  getStyles: getStyles,
  getComponents: getComponents,
  getComponentSets: getComponentSets,
  getImages: getImages,
  fetchBinary: fetchBinary,
  _setBackoffDelays: _setBackoffDelays,
  _resetBackoffDelays: _resetBackoffDelays,
  _setBaseUrl: _setBaseUrl,
  _resetBaseUrl: _resetBaseUrl,
};
