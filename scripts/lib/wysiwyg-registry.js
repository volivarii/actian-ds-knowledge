"use strict";

// Shared WYSIWYG registry helpers for non-bundled CJS consumers (the drift
// guard and the baseline runner). The editor gate (editor/src/lib/wysiwygPaths.ts)
// is ESM + bundled by vite and intentionally mirrors the flatMap inline to
// avoid pulling a CJS module into the bundle — see that file for context.
//
// Canonical logic lives HERE; gate mirrors it with a one-liner.

/**
 * Collect every repo-relative safe path from all domains.
 *
 * @param {object} domainsJson - Parsed domains.json object (top-level `domains` map).
 * @returns {string[]}
 */
function listSafePaths(domainsJson) {
  return Object.values(domainsJson.domains).flatMap(
    (d) => d.wysiwyg?.safePaths ?? [],
  );
}

/**
 * Look up the distEquivalence config for a given repo-relative source path,
 * or null if the path's domain has no per-file dist-equivalence configured.
 *
 * @param {object} domainsJson - Parsed domains.json object.
 * @param {string} relPath - Repo-relative path, e.g. "foundations/src/intro.md".
 * @returns {{ engine: string, sourceRel: string, rootAnchor?: string, applySkipH2Slugs?: boolean } | null}
 */
function distEquivalenceFor(domainsJson, relPath) {
  for (const domain of Object.values(domainsJson.domains)) {
    const safePaths = domain.wysiwyg?.safePaths;
    if (Array.isArray(safePaths) && safePaths.includes(relPath)) {
      return domain.wysiwyg.distEquivalence ?? null;
    }
  }
  return null;
}

/**
 * Compute the comparable dist-equivalence "view" of a safe path's body,
 * dispatching on the engine declared in its domain's distEquivalence config.
 * The drift guard compares this view before/after a Milkdown round-trip;
 * equality proves the round-trip is dist-safe for that file.
 *
 * Returns null when the path's domain declares no distEquivalence — those
 * domains (content/global, content/patterns) prove dist-safety holistically
 * via a CI derive-and-diff gate instead of per-file in the guard.
 *
 * Derive engines are LAZY-required (like writeAtomic's fs) so pure consumers
 * that only need listSafePaths — e.g. the baseline runner — don't pay to load
 * them:
 *   - "section-dist"       foundations/accessibility: parse into a Pattern-H
 *                          file tree via deriveFromMarkdown(); returns `.files`.
 *   - "guideline-sections" per-component guidelines: parse into the structured
 *                          sections[] array via guideline-md-parser; returns
 *                          `.sections`. The verbatim `markdown` field is
 *                          intentionally NOT part of the view — it drifts
 *                          rendered-equivalent across the round-trip (bullets,
 *                          HR, escapes, IAL removal) and is locked instead by
 *                          the full-dist no-op gate.
 *
 * @param {object} domainsJson - Parsed domains.json object.
 * @param {string} relPath - Repo-relative source path, e.g. "components/src/button/content.md".
 * @param {string} body - Markdown body with frontmatter already stripped.
 * @returns {unknown | null}
 */
function deriveEquivalenceView(domainsJson, relPath, body) {
  const cfg = distEquivalenceFor(domainsJson, relPath);
  if (cfg === null) return null;
  if (cfg.engine === "section-dist") {
    const { deriveFromMarkdown } = require("./section-dist/index.js");
    const { SKIP_H2_SLUGS } = require("../foundations/derive-foundations.js");
    return deriveFromMarkdown(body, {
      sourceRel: cfg.sourceRel,
      ...(cfg.rootAnchor !== undefined ? { rootAnchor: cfg.rootAnchor } : {}),
      ...(cfg.applySkipH2Slugs ? { skipH2Slugs: SKIP_H2_SLUGS } : {}),
      logger: { warn: () => {} },
    }).files;
  }
  if (cfg.engine === "guideline-sections") {
    const {
      parseGuidelineMarkdown,
    } = require("../components/guideline-md-parser.js");
    return parseGuidelineMarkdown(body).sections;
  }
  throw new Error(
    `wysiwyg-registry: unknown distEquivalence engine "${cfg.engine}" for ${relPath}`,
  );
}

module.exports = { listSafePaths, distEquivalenceFor, deriveEquivalenceView };
