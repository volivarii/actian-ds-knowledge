"use strict";

// Shared frontmatter + YAML parser, backed by the `yaml` library. Replaces the
// bespoke scripts/categories/categories-parser.js. Exposes the same API its
// consumers used (parse / splitFrontmatter / parseFrontmatter) so each consumer
// swap is a one-line require change.
//
// AUTHORING PROFILE: frontmatter is strict YAML 1.2 (core schema). Flow-map /
// flow-seq values containing commas, colons, or other YAML-special characters
// MUST be quoted. (The old parser tolerated unquoted prose commas inside flow
// maps; that tolerance is gone — sources are quoted instead.)

const YAML = require("yaml");

const FENCE = /^---\s*$/;

function splitFrontmatter(source) {
  const lines = source.split(/\r?\n/);
  if (lines.length === 0 || !FENCE.test(lines[0])) {
    throw new Error(
      "Missing opening `---` fence on line 1. Files must start with YAML frontmatter.",
    );
  }
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    throw new Error(
      "Missing closing `---` fence. Add a `---` line after the last frontmatter key.",
    );
  }
  return {
    frontmatter: lines.slice(1, endIdx).join("\n"),
    body: lines
      .slice(endIdx + 1)
      .join("\n")
      .replace(/^\n+/, ""),
    frontmatterLineOffset: 1,
  };
}

function parseFrontmatter(frontmatterText /*, lineOffset */) {
  // YAML 1.2 core schema (yaml lib default): true/false → bool, ints/floats →
  // number, null/~ → null, ISO dates stay strings, bare scalars → string.
  const data = YAML.parse(frontmatterText);
  return data == null ? {} : data;
}

function parse(source) {
  const split = splitFrontmatter(source);
  return {
    data: parseFrontmatter(split.frontmatter, split.frontmatterLineOffset),
    body: split.body,
  };
}

module.exports = { parse, splitFrontmatter, parseFrontmatter };
