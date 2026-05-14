#!/usr/bin/env node
"use strict";

// Thin CLI wrapper for scripts/components/derive-guidelines.js.
//
// Usage:
//   node scripts/components/__cli.js [--src DIR] [--dist DIR] [--manifest PATH] [--no-manifest] [--allow-empty]
//
// Defaults:
//   --src       components/src
//   --dist      components/dist/guidelines
//   --manifest  paths-manifest.json

const { runCli } = require("./derive-guidelines");

process.exit(runCli(process.argv));
