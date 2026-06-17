"use strict";

// Single source of truth for the transversal ref-kinds, shared by the derive
// (scripts/graph/derive-graph.js — which EMITS edges) and the coverage counter
// (scripts/graph/coverage.js — which independently COUNTS authored refs).
//
// Single-sourcing makes the shared assumption explicit: the coverage metric is
// independent on the EMITTED axis (it counts graph edges separately from the
// derive), NOT on the authoring-location axis (both read the same fields here).
// The "authored-location canary" in tests/graph-coverage.test.js guards the
// location: if authoring moves and these fields go empty, the canary fails
// instead of coverage silently reading 1.0.

// Category-scoped authored refs live at defaults[field][list] (array of {ref, note?}).
var CATEGORY_REF_KINDS = [
  {
    field: "a11y_refs",
    list: "requirementRefs",
    edge: "a11y_ref",
    targetType: "a11y_criterion",
  },
  {
    field: "motion_refs",
    list: "patternRefs",
    edge: "motion_ref",
    targetType: "motion_pattern",
  },
  {
    field: "foundations_refs",
    list: "sectionRefs",
    edge: "foundations_ref",
    targetType: "foundation_section",
  },
];

// Per-component authored refs live at doc.meta[field] (array of {ref}).
var COMPONENT_REF_KINDS = [
  { field: "a11y_refs", edge: "a11y_ref", targetType: "a11y_criterion" },
  { field: "motion_refs", edge: "motion_ref", targetType: "motion_pattern" },
  {
    field: "foundations_refs",
    edge: "foundations_ref",
    targetType: "foundation_section",
  },
];

// Stable display/report order for coverage metrics. Preserved VERBATIM — changing
// it reorders graph/dist/quality-report.json and trips the CI drift gate.
var EDGE_KINDS = ["a11y_ref", "foundations_ref", "motion_ref"];

module.exports = {
  CATEGORY_REF_KINDS: CATEGORY_REF_KINDS,
  COMPONENT_REF_KINDS: COMPONENT_REF_KINDS,
  EDGE_KINDS: EDGE_KINDS,
};
