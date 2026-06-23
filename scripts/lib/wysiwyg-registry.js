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

module.exports = { listSafePaths, distEquivalenceFor };
