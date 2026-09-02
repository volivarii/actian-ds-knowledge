"use strict";
// The by-design exemption record for FM-tier variant collapses. Same contract
// as variant-collapse-by-design.js: keyed by "<slug> <axis>=<value>", a reason
// per key, never a count or a threshold. Empty on the day the FM tier joined
// the quality roll-up (#554): 34 groups were measured and none had been
// decided. An entry belongs here only once someone has said why a value is
// drawn the same as another in a fat-marker wireframe.
module.exports = {};
