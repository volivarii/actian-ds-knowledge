"use strict";
const pure = require("./lib-pure");
const { writeAtomic } = require("../lib/dist-io");

module.exports = { ...pure, writeAtomic };
