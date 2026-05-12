#!/usr/bin/env node
"use strict";

// Thin CLI wrapper for scripts/categories/derive-categories.js.
//
// Usage:
//   node scripts/categories/__cli.js [--src DIR] [--dist DIR] [--manifest PATH] [--no-manifest]
//
// Defaults:
//   --src components/src/categories
//   --dist components/dist/categories
//   --manifest paths-manifest.json

const { runCli } = require("./derive-categories");

process.exit(runCli(process.argv));
