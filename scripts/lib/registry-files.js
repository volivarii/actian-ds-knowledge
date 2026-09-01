"use strict";
// The kit registries the graph deriver reads, in order.
//
// Its own module on purpose. Several gates need this list and must not restate it
// (a fourth kit added here has to reach all of them), but they must not have to
// load the graph deriver to get it either: validate-registries.js is a schema
// validator that runs under `continue-on-error` and whose empty output reads as
// "all schemas valid", so a require-time throw anywhere in the deriver's module
// graph — frontmatter, dist-io, model, to-jsonld — would silently turn registry
// validation into a false all-clear. A leaf module with no dependencies cannot
// fail that way.
//
// ORDER IS SEMANTIC: derive() maps it in order, detectSlugCollisions reports
// resolved_to as candidates[0].kit, and GraphBuilder first-wins gives dskit the
// title on a cross-kit collision. Frozen so an exported reference cannot be
// sorted or pushed by a consumer.
module.exports = Object.freeze([
  "components/dist/registries/dskit.json",
  "components/dist/registries/fmkit.json",
  "components/dist/registries/metakit.json",
]);
