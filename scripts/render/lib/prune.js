"use strict";
// The one prune every render producer uses (#572 asked for one helper rather
// than a copy each). Three guards, learned the hard way:
//
// - the WIPE guard: an empty keep set is a missing input, not a retirement.
//   "derive produced nothing so delete everything" is the shape that once
//   removed 179 committed anatomy files.
// - the CEILING: more than PRUNE_CEILING deletions in one run is a partial or
//   broken derive, not a mass retirement. A legitimate wave larger than that
//   is done in two runs, on purpose, by a person.
// - the SPLIT: vetPrune decides and deletes nothing, so a producer can refuse
//   BEFORE it writes; deleteFiles acts on exactly the vetted list.
var fs = require("node:fs");
var path = require("node:path");

var PRUNE_CEILING = 10;

/** Files in `dir` with extension `ext` that are not in `keepFiles`, or throw. */
function vetPrune(dir, keepFiles, opts) {
  var label = (opts && opts.label) || "prune";
  var noun = (opts && opts.noun) || "files";
  var ext = (opts && opts.ext) || "";
  if (!keepFiles.length) {
    throw new Error(label + ": refusing to prune against an empty slug set");
  }
  var keep = Object.create(null);
  keepFiles.forEach(function (f) {
    keep[f] = true;
  });
  var doomed = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(function (f) {
        return f.endsWith(ext) && !keep[f];
      })
    : [];
  if (doomed.length > PRUNE_CEILING) {
    throw new Error(
      label + ": refusing to delete " + doomed.length + " " + noun + " in one run " +
        "(ceiling " + PRUNE_CEILING + "). This is a partial or broken derive, not a " +
        "retirement. Nothing was written or deleted. Files: " + doomed.join(", "),
    );
  }
  return doomed.sort();
}

function deleteFiles(dir, doomed) {
  return doomed.map(function (f) {
    fs.unlinkSync(path.join(dir, f));
    return f;
  });
}

module.exports = { PRUNE_CEILING: PRUNE_CEILING, vetPrune: vetPrune, deleteFiles: deleteFiles };
