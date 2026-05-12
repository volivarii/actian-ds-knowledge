"use strict";

// Single source of truth for status emoji vocabulary recognized in
// foundations.md and component-guideline tables.
//
// Two parallel vocabularies, intentionally kept in one map:
//
//   Token-status vocab (used in foundations.md token tables — column "Status"):
//     🟢  → "shipped"      (lifecycle: ready for use)
//     🔵  → "in-review"    (lifecycle: proposed, reviewed by leads)
//     🟡  → "proposed"     (lifecycle: drafted, not yet reviewed)
//
//   Component-status vocab (used in component guidelines tables, legacy):
//     ✅  → null           (current — no flag emitted)
//     ⚠️  → "proposed"     (legacy synonym for 🟡)
//     ❌  → "deprecated"
//     🚧  → "in-progress"
//
// The two vocabularies overlap intentionally: ⚠️ and 🟡 both map to "proposed".
// Authors of new content should prefer the colored-circle vocabulary (🟢🔵🟡).
// The check-marks/warning vocab stays recognized for back-compat with older
// component guidelines.
var STATUS_MAP = {
  // Token-status (new vocab — PR α.5, schema-less derive)
  "🟢": "shipped",
  "🔵": "in-review",
  "🟡": "proposed",
  // Component-status (legacy vocab)
  "✅": null,
  "⚠️": "proposed",
  "❌": "deprecated",
  "🚧": "in-progress",
};

// Match a leading status emoji at the start of a value cell. Capture group 1
// is the emoji, group 2 is the remainder. The "⚠️" sequence includes a VS-16
// variation selector; we keep it as-is since that's how the source MD encodes it.
var LEADING_EMOJI_RE = /^\s*(🟢|🔵|🟡|✅|⚠️|❌|🚧)\s*(.*?)\s*$/;

function extractStatus(s) {
  var trimmed = String(s).trim();
  if (Object.prototype.hasOwnProperty.call(STATUS_MAP, trimmed)) {
    return STATUS_MAP[trimmed];
  }
  return null;
}

extractStatus.fromValueCell = function (s) {
  var m = LEADING_EMOJI_RE.exec(String(s));
  if (m && Object.prototype.hasOwnProperty.call(STATUS_MAP, m[1])) {
    return { value: m[2], status: STATUS_MAP[m[1]] };
  }
  return { value: String(s).trim(), status: null };
};

extractStatus.STATUS_MAP = STATUS_MAP;
extractStatus.RECOGNIZED_EMOJI = Object.keys(STATUS_MAP);

// Friendly hint string for author-facing error messages.
extractStatus.suggestionHint = function () {
  return (
    "Did you mean one of: 🟢 (shipped) / 🔵 (in-review) / 🟡 (proposed)? " +
    "Legacy vocab still recognized: ✅ (current) / ⚠️ (proposed) / ❌ (deprecated) / 🚧 (in-progress)."
  );
};

module.exports = { extractStatus };
