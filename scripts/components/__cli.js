#!/usr/bin/env node
"use strict";

// Thin CLI wrapper for the components derive pipeline.
//
// Runs two derivations:
//   1. scripts/components/derive-guidelines.js — per-component multi-domain
//      guideline JSONs at components/dist/guidelines/<slug>.json (plus
//      bundle + coverage + manifest entries).
//   2. scripts/components/derive-media-index.js — slug → role-map index at
//      components/dist/media/_index.json, scanning the on-disk media dir.
//      Independent of (1): media exists for components without guideline
//      docs; this index ensures docs/plugin/MCP consumers can enumerate
//      media without a filesystem scan.
//
// Usage:
//   node scripts/components/__cli.js [--src DIR] [--dist DIR] [--manifest PATH] [--no-manifest] [--allow-empty]
//
// Defaults:
//   --src       components/src
//   --dist      components/dist/guidelines
//   --manifest  paths-manifest.json

const path = require("node:path");
const { runCli } = require("./derive-guidelines");
const { writeMediaIndex } = require("./derive-media-index");

const exitCode = runCli(process.argv);

// Run media index derive only when guidelines derive succeeded — same gating
// as the auto-bump step in guidelines-derive.yml. Repo root is the CLI's
// grandparent dir (mirrors defaultPaths() in derive-guidelines.js).
if (exitCode === 0) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const r = writeMediaIndex(repoRoot);
  if (r.wrote) {
    process.stdout.write(
      "[derive-media-index] wrote components/dist/media/_index.json (" +
        r.slugCount +
        " slug" +
        (r.slugCount === 1 ? "" : "s") +
        ")\n",
    );
  } else if (r.path) {
    process.stdout.write(
      "[derive-media-index] no change (" + r.slugCount + " slugs)\n",
    );
  }
}

process.exit(exitCode);
