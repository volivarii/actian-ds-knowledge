#!/usr/bin/env node
"use strict";
const { runCli } = require("./derive-app-context");
process.exit(runCli(process.argv));
