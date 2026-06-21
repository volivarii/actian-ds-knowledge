"use strict";
const fs = require("node:fs");
const path = require("node:path");
const pure = require("./lib-pure");

function writeAtomic(absPath, contents) {
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, contents);
}

module.exports = { ...pure, writeAtomic };
