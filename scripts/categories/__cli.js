#!/usr/bin/env node
"use strict";

var path = require("node:path");
var derive = require("./derive-categories.js");

var srcDir = path.resolve(__dirname, "..", "..", "components", "src", "categories");
var distDir = path.resolve(__dirname, "..", "..", "components", "dist", "categories");

var argv = process.argv.slice(2);
for (var i = 0; i < argv.length; i++) {
  if (argv[i] === "--src" && argv[i + 1]) {
    srcDir = path.resolve(argv[i + 1]);
    i++;
  } else if (argv[i] === "--dist" && argv[i + 1]) {
    distDir = path.resolve(argv[i + 1]);
    i++;
  }
}

try {
  var results = derive.deriveFromDir(srcDir, distDir);
  console.log("derived " + results.length + " category default file(s):");
  results.forEach(function (r) {
    console.log("  " + r.src + " → " + r.dist);
  });
  process.exit(0);
} catch (err) {
  console.error("[derive-categories] " + err.message);
  process.exit(1);
}
