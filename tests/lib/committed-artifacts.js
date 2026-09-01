"use strict";
// Test-side alias for the shared committed-read leaf.
//
// One implementation, not two: this used to carry its own copy of the git reads,
// and scripts/validate/validate-graph-registry-union.js carried another. They had
// already drifted (only one set maxBuffer, only one documented the
// ls-tree-over-cat-file reasoning), which is the restating-instead-of-reading
// shape this whole change exists to remove.
//
// See scripts/lib/committed-read.js for why reading HEAD is necessary at all, and
// #624 for the confinement fix that would make it unnecessary.
module.exports = require("../../scripts/lib/committed-read.js");
