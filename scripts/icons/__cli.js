#!/usr/bin/env node
"use strict";

// Thin CLI wrapper for scripts/icons/derive-icons-svg.js.
// Usage: node scripts/icons/__cli.js  (run via `npm run derive:icons`)

const { runCli } = require("./derive-icons-svg");

process.exit(runCli());
