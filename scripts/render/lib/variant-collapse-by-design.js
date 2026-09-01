"use strict";

// The by-design exemption record for variant collapses.
// Shared by the ratchet gate and the quality-trend derive so the "unexplained"
// figure has ONE definition. A second copy would let the reported number and
// the gated number drift apart silently, which is the whole failure this
// artifact exists to stop.

// Keyed by the exact value, not by the slug, so a reason cannot drift onto a
// different regression in the same component. Every key is asserted below to
// still name a real collapse AND to carry a usable reason, so one left behind by
// a fix cannot quietly cover the next one.
//
// This is a decision record, not a tally: it must never grow a count, a
// threshold, or an entry whose reason is "known issue". A Figma value rename is
// a legitimate entry, but its reason must name the key it replaces.
module.exports = {
  // ds-html-map.js, case "spinner": "Complete = 25%|50%|75%|100% is the
  // animation's own arc-fill cycle, not a chooseable variant (usage guideline),
  // so it is ignored here."
  "spinner Complete=25%": "an animation keyframe, not a chooseable variant",
  "spinner Complete=75%": "an animation keyframe, not a chooseable variant",
  "spinner Complete=100%": "an animation keyframe, not a chooseable variant",
  // ds-html-map.js, case "loader": "Registry axis: Percent (auto-named
  // variants). 'loader' is the indeterminate activity spinner (determinate
  // progress is the progress-bar-small leaf)."
  "loader Percent=10%":
    "loader is the INDETERMINATE spinner; determinate progress is progress-bar-small",
  "loader Percent=50":
    "loader is the INDETERMINATE spinner; Percent=50 renders the same spinner as every other Percent value",
  // ds-html-map.js, case "search-result-card": "Studio's structural swaps
  // (button -> progress-bar-small, digram -> tag-read-only) are intentionally NOT
  // built here, per the spec. App=Studio therefore renders the BASE card with no
  // root modifier -- there is no built CSS delta for it, and a modifier class
  // must not be emitted without one."
  "search-result-card App=Studio":
    "Studio's structural swaps are not built, and a modifier class must not be emitted with no CSS delta",
  // ds-html-map.js, case "whats-new-dropdown": "The guideline collapses
  // Drilldown1+Drilldown2 into one 'Drilldown' concept, so normalize both onto a
  // single wnMode."
  "whats-new-dropdown Property 1=Drilldown2":
    "the guideline folds Drilldown1 and Drilldown2 into one Drilldown concept",
};

