"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var S = require("../scripts/sync/sync-from-figma.js");

// ---------------------------------------------------------------------------
// Failure-kind classification.
//
// An expired Figma PAT fails every phase at its first request, and the verdict
// reported that as a bare `error` — the same word a dangling curated override
// gets. On 2026-07-30 the token expired and the nightly stayed red for 11
// nights while the tracking issue advised hunting a renamed icon slug: the
// wrong first move, discoverable only by reading the run log.
//
// The classifier exists so the remedy can name itself, which makes the
// interesting case the MIXED one: an auth-only diagnosis on a run that also has
// a genuine content error would send a reader to rotate a token and stop,
// leaving the real defect unobserved. So "auth" requires that EVERY error be a
// credential rejection.
//
// The message shapes below are copied from real run logs (run 31369900326,
// 2026-08-10) rather than invented, because this classifier's whole contract is
// recognising what the Figma API actually says.
// ---------------------------------------------------------------------------

var REAL_401 =
  "Figma API request failed: 401 Unauthorized " +
  "(https://api.figma.com/v1/files/KEY/component_sets) — " +
  '{"status":401,"err":"Token has expired"}';

var REAL_403 =
  "Figma API request failed: 403 Forbidden " +
  "(https://api.figma.com/v1/files/KEY?depth=2) — " +
  '{"status":403,"err":"Token expired"}';

var REAL_CONTENT_ERROR =
  "icons phase: curated slug 'chevron-up' in components/src/icons-svg.json " +
  "resolves to no Figma node";

test("isAuthError recognises the shapes Figma actually returns for a dead token", function () {
  assert.equal(isAuth(REAL_401), true, "401 Token has expired");
  assert.equal(isAuth(REAL_403), true, "403 Token expired");
  assert.equal(
    isAuth('403 Forbidden — {"status":403,"err":"Invalid token"}'),
    true,
    "403 Invalid token (revoked rather than expired)",
  );
});

test("isAuthError does not claim a content failure is a credential failure", function () {
  assert.equal(isAuth(REAL_CONTENT_ERROR), false, "dangling curated slug");
  assert.equal(
    isAuth("Figma API request failed: 500 Internal Server Error"),
    false,
    "an upstream outage is not a credential problem",
  );
  assert.equal(
    isAuth("Figma API request failed: 404 Not Found (file deleted)"),
    false,
    "a missing file is not a credential problem",
  );
  // The words alone must not be enough: a component genuinely named after them
  // would otherwise be misread as an auth failure.
  assert.equal(
    isAuth("component 'token expired badge' has no anatomy capture"),
    false,
    "the phrase without a 401/403 status is not an auth failure",
  );
});

test("failureKind: auth only when EVERY error is a credential rejection", function () {
  assert.equal(S.failureKind([]), "none", "no errors");
  assert.equal(S.failureKind(undefined), "none", "no errors array at all");

  assert.equal(
    S.failureKind([err("registry:dsKit", REAL_401), err("styles:dsKit", REAL_403)]),
    "auth",
    "every phase rejected: rotate the token",
  );

  // The case that protects the reader: one real defect hiding behind an auth
  // storm must NOT be reported as "just rotate the token".
  assert.equal(
    S.failureKind([err("registry:dsKit", REAL_401), err("icons", REAL_CONTENT_ERROR)]),
    "content",
    "mixed run stays content, so the real defect still gets read",
  );

  assert.equal(
    S.failureKind([err("icons", REAL_CONTENT_ERROR)]),
    "content",
    "content only",
  );
});

function isAuth(message) {
  return S.isAuthError(new Error(message));
}

function err(label, message) {
  return { label: label, error: new Error(message) };
}
