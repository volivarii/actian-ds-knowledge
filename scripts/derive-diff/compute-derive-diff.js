#!/usr/bin/env node
"use strict";

// Computes the dist-output diff between two git refs by running derive on each
// side and comparing the resulting dist trees. Used by the derive-diff PR
// comment workflow.
//
// Strategy:
//   1. Caller checks out PR branch, runs derives, snapshots dist/ paths into
//      a manifest (relative path → sha-256). This is the "after" snapshot.
//   2. Caller checks out base ref, runs derives, snapshots again. "Before".
//   3. This script reads two manifest files and emits an added/modified/
//      removed summary as markdown.
//
// Manifest format (one JSON file with { path: sha256 } map).
//
// Output: markdown to stdout.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function shaOfFile(filePath) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return h.digest("hex");
}

function walk(dir, out, baseDir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out, baseDir);
    } else if (entry.isFile()) {
      out[path.relative(baseDir, abs)] = shaOfFile(abs);
    }
  }
}

function snapshot(rootDirs) {
  const out = {};
  for (const dir of rootDirs) {
    walk(dir, out, ".");
  }
  return out;
}

function diffSnapshots(before, after) {
  const added = [];
  const modified = [];
  const removed = [];
  for (const p of Object.keys(after).sort()) {
    if (!(p in before)) added.push(p);
    else if (before[p] !== after[p]) modified.push(p);
  }
  for (const p of Object.keys(before).sort()) {
    if (!(p in after)) removed.push(p);
  }
  return { added, modified, removed };
}

function renderMarkdown({ added, modified, removed }) {
  const lines = [];
  lines.push("**Derive output changes for this PR:**");
  lines.push("");

  if (added.length === 0 && modified.length === 0 && removed.length === 0) {
    lines.push(
      "No changes to derived dist files. The CI derive scripts produce the same output as on `main`.",
    );
    return lines.join("\n");
  }

  if (added.length > 0) {
    lines.push("**Added** (" + added.length + " file" + (added.length === 1 ? "" : "s") + "):");
    for (const p of added) lines.push("- `" + p + "`");
    lines.push("");
  }

  if (modified.length > 0) {
    lines.push("**Modified** (" + modified.length + " file" + (modified.length === 1 ? "" : "s") + "):");
    for (const p of modified) lines.push("- `" + p + "`");
    lines.push("");
  }

  if (removed.length > 0) {
    lines.push("**Removed** (" + removed.length + " file" + (removed.length === 1 ? "" : "s") + "):");
    for (const p of removed) lines.push("- `" + p + "`");
    lines.push("");
  }

  lines.push(
    "These changes are auto-generated from your edits to source files (`foundations/src/`, `content/src/`, etc.). If anything looks unexpected, check that source.",
  );

  return lines.join("\n");
}

function parseArgs(argv) {
  const args = { mode: null, dirs: [], out: null, before: null, after: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--snapshot") args.mode = "snapshot";
    else if (a === "--diff") args.mode = "diff";
    else if (a === "--dir") args.dirs.push(argv[++i]);
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--before") args.before = argv[++i];
    else if (a === "--after") args.after = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.mode === "snapshot") {
    if (args.dirs.length === 0 || !args.out) {
      process.stderr.write(
        "Usage: --snapshot --dir <path> [--dir <path> ...] --out <file>\n",
      );
      process.exit(2);
    }
    const snap = snapshot(args.dirs);
    fs.writeFileSync(args.out, JSON.stringify(snap, null, 2));
    process.stderr.write(
      "[derive-diff] snapshot wrote " +
        Object.keys(snap).length +
        " entries to " +
        args.out +
        "\n",
    );
    return;
  }
  if (args.mode === "diff") {
    if (!args.before || !args.after) {
      process.stderr.write(
        "Usage: --diff --before <file> --after <file>\n",
      );
      process.exit(2);
    }
    const before = JSON.parse(fs.readFileSync(args.before, "utf8"));
    const after = JSON.parse(fs.readFileSync(args.after, "utf8"));
    const d = diffSnapshots(before, after);
    process.stdout.write(renderMarkdown(d) + "\n");
    return;
  }
  process.stderr.write(
    "Usage:\n  --snapshot --dir <path> [--dir <path>] --out <manifest.json>\n  --diff --before <manifest.json> --after <manifest.json>\n",
  );
  process.exit(2);
}

if (require.main === module) main();

module.exports = { snapshot, diffSnapshots, renderMarkdown };
