"use strict";

/**
 * paths.js — In-repo path constants for knowledge-repo generators.
 *
 * Mirrors the plugin's scripts/lib/paths.js shape but scoped to in-repo
 * paths (no vendor/ prefix). Generators may import from this rather than
 * hardcoding path.join() calls. Future restructures only touch this file.
 *
 * Note: the canonical contract for downstream consumers is
 * paths-manifest.json at the repo root. This file is purely a convenience
 * for in-repo scripts.
 */

var path = require("path");

var REPO_ROOT = path.resolve(__dirname, "..", "..");

var PATHS = {
  repoRoot: REPO_ROOT,
  manifest: path.join(REPO_ROOT, "paths-manifest.json"),

  foundations: {
    src: path.join(REPO_ROOT, "foundations", "src"),
    authoring: path.join(REPO_ROOT, "foundations", "src", "AUTHORING.md"),
    parserMap: path.join(
      REPO_ROOT,
      "scripts",
      "foundations",
      "foundations.parser.json",
    ),
    dist: path.join(REPO_ROOT, "foundations", "dist"),
  },

  tokens: {
    json: path.join(REPO_ROOT, "tokens", "tokens.json"),
    css: path.join(REPO_ROOT, "tokens", "tokens.css"),
    reference: path.join(REPO_ROOT, "tokens", "token-reference.md"),
  },

  components: {
    src: {
      guidelinesDir: path.join(REPO_ROOT, "components", "src", "guidelines"),
      guidelinesIndex: path.join(
        REPO_ROOT,
        "components",
        "src",
        "guidelines",
        "_index.json",
      ),
    },
    dist: {
      registriesDir: path.join(REPO_ROOT, "components", "dist", "registries"),
      dskit: path.join(
        REPO_ROOT,
        "components",
        "dist",
        "registries",
        "dskit.json",
      ),
      fmkit: path.join(
        REPO_ROOT,
        "components",
        "dist",
        "registries",
        "fmkit.json",
      ),
      metakit: path.join(
        REPO_ROOT,
        "components",
        "dist",
        "registries",
        "metakit.json",
      ),
      styles: path.join(
        REPO_ROOT,
        "components",
        "dist",
        "registries",
        "meta-kit",
        "styles.json",
      ),
      textStyles: path.join(REPO_ROOT, "components", "dist", "text-styles.md"),
      effectStyles: path.join(
        REPO_ROOT,
        "components",
        "dist",
        "effect-styles.md",
      ),
    },
  },

  content: path.join(REPO_ROOT, "content", "content.md"),
  accessibility: {
    src: path.join(REPO_ROOT, "accessibility", "src"),
    index: path.join(REPO_ROOT, "accessibility", "dist", "a11y-index.json"),
  },
  appContext: path.join(REPO_ROOT, "app-context", "app-context.json"),
};

module.exports = PATHS;
