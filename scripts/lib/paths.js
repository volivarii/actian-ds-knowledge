"use strict";

/**
 * paths.js — Single source of truth for in-repo paths used by knowledge-repo
 * generators and CI scripts. Mirrors the plugin's scripts/lib/paths.js shape.
 *
 * Pre-Phase-D dual-publish window: every "dist" leaf has a matching "legacy"
 * leaf so generators can write to both old and new locations during the
 * src/+dist/ migration. After Phase D removes legacy paths, the legacy
 * fields can be dropped.
 *
 * See docs/superpowers/specs/2026-05-10-knowledge-repo-restructure-design.md
 * (in plugin repo, gitignored) for the migration plan.
 */

var path = require("path");

// Resolves to <repoRoot> from scripts/lib/.
var REPO_ROOT = path.resolve(__dirname, "..", "..");

var PATHS = {
  repoRoot: REPO_ROOT,

  foundations: {
    src: path.join(REPO_ROOT, "foundations", "src"),
    md: path.join(REPO_ROOT, "foundations", "src", "foundations.md"),
    authoring: path.join(REPO_ROOT, "foundations", "src", "AUTHORING.md"),
    parserMap: path.join(
      REPO_ROOT,
      "scripts",
      "foundations",
      "foundations.parser.json",
    ),
    dist: path.join(REPO_ROOT, "foundations", "dist"),
    // Legacy (Phase B dual-publish; removed in Phase D).
    legacy: {
      md: path.join(REPO_ROOT, "foundations", "foundations.md"),
      authoring: path.join(REPO_ROOT, "foundations", "AUTHORING.md"),
      dist: path.join(REPO_ROOT, "foundations"),
    },
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
    // Legacy (Phase B dual-publish; removed in Phase D).
    legacy: {
      guidelinesDir: path.join(REPO_ROOT, "components", "guidelines"),
      registriesDir: path.join(REPO_ROOT, "components", "registries"),
      dskit: path.join(
        REPO_ROOT,
        "components",
        "registries",
        "dskit.json",
      ),
      fmkit: path.join(
        REPO_ROOT,
        "components",
        "registries",
        "fmkit.json",
      ),
      metakit: path.join(
        REPO_ROOT,
        "components",
        "registries",
        "metakit.json",
      ),
      styles: path.join(
        REPO_ROOT,
        "components",
        "registries",
        "meta-kit",
        "styles.json",
      ),
      textStyles: path.join(REPO_ROOT, "components", "text-styles.md"),
      effectStyles: path.join(REPO_ROOT, "components", "effect-styles.md"),
    },
  },

  content: path.join(REPO_ROOT, "content", "content.md"),
  accessibility: path.join(REPO_ROOT, "accessibility", "accessibility.md"),
  presentation: path.join(REPO_ROOT, "presentation", "presentation-guide.md"),
  appContext: path.join(REPO_ROOT, "app-context", "app-context.json"),
  fmToDsMap: path.join(REPO_ROOT, "fm-to-ds-map", "fm-to-ds-map.json"),
};

module.exports = PATHS;
