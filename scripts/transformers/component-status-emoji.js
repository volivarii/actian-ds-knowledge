"use strict";

// DS Kit component page-name status emoji parser.
//
// Mirrors the pattern of scripts/lib/section-dist/status-emoji.js
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

// U+FE0F (variation selector-16) is what makes an emoji render in colour, and
// whether it is present is invisible in the Figma layer-name field. `✅` in the
// map carries none while `✍️ ⛔️ ⚠️` do, so matching the exact sequence made
// `⚠ Tooltip` and `⚠️ Tooltip` different strings. Comparing without it means a
// designer cannot get this wrong by pasting a slightly different glyph, which
// matters now that an unrecognised emoji is a hard failure rather than a
// harmless passthrough.
var VS16_RE = /️/g;

function dropVs16(s) {
  return String(s).replace(VS16_RE, "");
}

// Base-form → status, so lookup is variation-selector insensitive.
var BASE_STATUS_MAP = Object.keys(COMPONENT_STATUS_MAP).reduce(function (
  acc,
  emoji,
) {
  acc[dropVs16(emoji)] = COMPONENT_STATUS_MAP[emoji];
  return acc;
}, Object.create(null));

// Matches a leading status emoji. The separating whitespace is optional: a
// missing space is a typo, not a different intent, and treating `⛔️Popover` as
// an unrecognised emoji would fail the sync over one character.
// Group 1 = emoji (base form after VS16 removal), group 2 = the rest.
var LEADING_EMOJI_RE = /^\s*(✅|✍|⛔|⚠)\s*(.*?)\s*$/;

function extractStatus(input) {
  var raw = String(input == null ? "" : input);
  var m = LEADING_EMOJI_RE.exec(dropVs16(raw));
  if (m && Object.prototype.hasOwnProperty.call(BASE_STATUS_MAP, m[1])) {
    return { status: BASE_STATUS_MAP[m[1]], cleanName: m[2] };
  }
  return { status: null, cleanName: raw.trim() };
}

module.exports = {
  extractStatus: extractStatus,
  COMPONENT_STATUS_MAP: COMPONENT_STATUS_MAP,
};
