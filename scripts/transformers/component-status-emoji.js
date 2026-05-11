"use strict";

// DS Kit component page-name status emoji parser.
//
// Mirrors the pattern of scripts/foundations/foundations-parser/status-emoji.js
// but with the component-side emoji vocabulary. The foundations parser uses
// `🚧 / ❌ / ⚠️` for in-progress / deprecated / proposed. DS Kit component
// pages use `✍️ / ⛔️ / ⚠️` for in-progress / deprecated / warn. The two
// domains use different vocabulary on purpose; do not unify.
//
// `✅` → status field OMITTED (curated/healthy is implicit). Matches the
// foundations convention of not emitting a "current" status flag.

var COMPONENT_STATUS_MAP = Object.freeze({
  "✅": null, // curated — caller should omit the field
  "✍️": "in-progress",
  "⛔️": "deprecated",
  "⚠️": "warn",
});

// Matches a leading status emoji with surrounding whitespace.
// Group 1 = emoji, group 2 = the rest (trimmed by greedy + non-greedy combo).
var LEADING_EMOJI_RE = /^\s*(✅|✍️|⛔️|⚠️)\s+(.*?)\s*$/;

function extractStatus(input) {
  var raw = String(input == null ? "" : input);
  var m = LEADING_EMOJI_RE.exec(raw);
  if (m && Object.prototype.hasOwnProperty.call(COMPONENT_STATUS_MAP, m[1])) {
    return { status: COMPONENT_STATUS_MAP[m[1]], cleanName: m[2] };
  }
  return { status: null, cleanName: raw.trim() };
}

module.exports = {
  extractStatus: extractStatus,
  COMPONENT_STATUS_MAP: COMPONENT_STATUS_MAP,
};
