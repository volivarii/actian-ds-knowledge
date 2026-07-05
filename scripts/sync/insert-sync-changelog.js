"use strict";

// insert-sync-changelog — record a BREAKING nightly sync in CHANGELOG.md.
//
// The repo's changelog rule (CLAUDE.md) applies to the sync bot too: breaking
// syncs are notable changes a consumer must know about, but the bot never
// wrote an entry (the generated release-notes file is gitignored and the PR
// body is not part of the repo history). sync-from-figma.yml calls this after
// PR creation, so the entry carries the real PR number, and commits it back
// to the sync branch. Additive nightly refreshes stay unlisted by design.
//
// Pure insertion logic exported for tests; CLI does the file I/O.

function insertSyncChangelog(content, opts) {
  var pr = String(opts.pr);
  var marker = "[#" + pr + "]";
  // Idempotent per PR: a re-run (workflow retry) must not duplicate.
  if (content.indexOf(marker) !== -1) {
    return { content: content, inserted: false, reason: "already recorded" };
  }
  var heading = "## [Unreleased]";
  var idx = content.indexOf(heading);
  if (idx === -1) {
    return { content: content, inserted: false, reason: "no Unreleased" };
  }
  var link =
    "[#" + pr + "](https://github.com/" + opts.repo + "/pull/" + pr + ")";
  var bullet =
    "- **Breaking Figma sync (" +
    opts.date +
    ").** Component or variant changes the nightly sync classified as " +
    "breaking; the PR body carries the per-component diff summary. (" +
    link +
    ")";
  // Reuse an existing "### Changed" heading inside the Unreleased section
  // (bounded by the next "## [" release heading) instead of duplicating it.
  var sectionEnd = content.indexOf("\n## [", idx + heading.length);
  if (sectionEnd === -1) sectionEnd = content.length;
  var changedHeading = "### Changed";
  var changedIdx = content.indexOf(changedHeading, idx);
  var insertAt;
  var entry;
  if (changedIdx !== -1 && changedIdx < sectionEnd) {
    insertAt = changedIdx + changedHeading.length;
    entry = "\n" + bullet;
  } else {
    insertAt = idx + heading.length;
    entry = "\n\n" + changedHeading + "\n" + bullet;
  }
  return {
    content: content.slice(0, insertAt) + entry + content.slice(insertAt),
    inserted: true,
  };
}

module.exports = { insertSyncChangelog: insertSyncChangelog };

// CLI: node insert-sync-changelog.js --pr <n> --date <YYYY-MM-DD> --repo <owner/name> [--file <path>]
if (require.main === module) {
  var fs = require("fs");
  var args = process.argv.slice(2);
  var opts = {};
  for (var i = 0; i < args.length; i++) {
    if (args[i] === "--pr") opts.pr = args[++i];
    else if (args[i] === "--date") opts.date = args[++i];
    else if (args[i] === "--repo") opts.repo = args[++i];
    else if (args[i] === "--file") opts.file = args[++i];
    else {
      process.stderr.write("Unknown arg: " + args[i] + "\n");
      process.exit(1);
    }
  }
  if (!opts.pr || !opts.date || !opts.repo) {
    process.stderr.write(
      "Usage: insert-sync-changelog.js --pr <n> --date <YYYY-MM-DD> --repo <owner/name> [--file <path>]\n",
    );
    process.exit(1);
  }
  var file = opts.file || "CHANGELOG.md";
  var content = fs.readFileSync(file, "utf8");
  var r = insertSyncChangelog(content, opts);
  if (r.inserted) {
    fs.writeFileSync(file, r.content, "utf8");
    process.stdout.write(
      "[insert-sync-changelog] recorded breaking sync PR #" + opts.pr + "\n",
    );
  } else {
    process.stdout.write(
      "[insert-sync-changelog] skipped (" + r.reason + ")\n",
    );
  }
}
