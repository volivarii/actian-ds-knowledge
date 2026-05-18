"use strict";

// Pattern → component fan-out.
//
// Cross-cutting UX-pattern content lives in content/src/{patterns,product}/<slug>.md.
// Today's pipeline emits that content ONLY into the consolidated content/dist/global.md
// (the docs /content mega-page). This module is the bridge that also routes pattern
// sections into each related component's per-component guideline JSON so the docs
// component pages + plugin /component-brief surface the relevant pattern guidance.
//
// Routing is author-controlled via two optional frontmatter fields on each pattern .md:
//
//   relatedComponents: [text-input, checkbox, ...]   # explicit slugs
//   relatedCategories: [form-input-selection]         # all components in a category
//
// Either, both, or neither may be present. Neither = pattern stays global-only
// (existing behavior — no breaking change for unmodified pattern files).
//
// This module is INVOKED FROM scripts/components/derive-guidelines.js's
// derivePipeline AFTER the per-component map is built from components/src/ and
// BEFORE the JSONs are written. Single write phase, no workflow race,
// idempotency by construction (perComponent is rebuilt from scratch every run).
//
// Idempotency note: a re-run drops every prior pattern-sourced section
// (identified by section.source) from each domain's sections[] before
// re-appending freshly-computed ones. Authored sections (no source marker)
// are preserved untouched.

var fs = require("node:fs");
var path = require("node:path");

var mdParser = require("../components/guideline-md-parser");

// ───────────────────────────────────────────────────────────────────────────
// Frontmatter parsing — strict subset for our two fields only
// ───────────────────────────────────────────────────────────────────────────

// We don't pull a YAML lib here — content/src/* frontmatter is already YAML
// (parsed via Jekyll). Our two fields are simple flow arrays of slugs. This
// helper accepts the two supported shapes:
//
//   relatedComponents: [a, b, c]              # inline (flow) array
//   relatedComponents:                        # block array
//     - a
//     - b
//
// Anything else falls through to undefined — non-list values + unknown fields
// are ignored at parse time. The fanout pipeline then validates referenced
// slugs against the registry / categories (the CI gate).
var SLUG_RE = /^[a-z][a-z0-9-]*$/;

function parsePatternFrontmatter(frontmatterStr) {
  if (!frontmatterStr) return {};
  var lines = String(frontmatterStr).split(/\r?\n/);
  var out = {};
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Inline flow: "key: [a, b, c]"
    var inlineMatch = line.match(/^(\w[\w-]*)\s*:\s*\[([^\]]*)\]\s*$/);
    if (inlineMatch) {
      var key = inlineMatch[1];
      var items = inlineMatch[2]
        .split(",")
        .map(function (s) {
          return s.trim().replace(/^["']|["']$/g, "");
        })
        .filter(Boolean);
      if (key === "relatedComponents" || key === "relatedCategories") {
        out[key] = items;
      }
      continue;
    }
    // Block: "key:" followed by "  - value" lines
    var blockMatch = line.match(/^(\w[\w-]*)\s*:\s*$/);
    if (blockMatch) {
      var blockKey = blockMatch[1];
      if (blockKey !== "relatedComponents" && blockKey !== "relatedCategories")
        continue;
      var collected = [];
      for (var j = i + 1; j < lines.length; j++) {
        var sub = lines[j];
        var itemMatch = sub.match(/^\s+-\s+(.+?)\s*$/);
        if (itemMatch) {
          collected.push(itemMatch[1].replace(/^["']|["']$/g, ""));
          continue;
        }
        // First non-item, non-blank line ends the block.
        if (!/^\s*$/.test(sub)) {
          i = j - 1;
          break;
        }
      }
      out[blockKey] = collected;
      continue;
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Pattern file discovery + parsing
// ───────────────────────────────────────────────────────────────────────────

// Sub-buckets under content/src/ that we treat as cross-cutting pattern source.
// MUST match scripts/content/derive-content.js#CONTENT_SUB_BUCKETS for the
// patterns + product entries (writing/* is voice/tone guidance, not fanned out).
var PATTERN_BUCKETS = ["patterns", "product"];

function listPatternFiles(contentSrcRoot) {
  var out = [];
  for (var b = 0; b < PATTERN_BUCKETS.length; b++) {
    var bucketDir = path.join(contentSrcRoot, PATTERN_BUCKETS[b]);
    if (!fs.existsSync(bucketDir)) continue;
    var entries = fs.readdirSync(bucketDir).sort();
    for (var i = 0; i < entries.length; i++) {
      var name = entries[i];
      if (!/\.md$/.test(name)) continue;
      out.push({
        bucket: PATTERN_BUCKETS[b],
        slug: name.replace(/\.md$/, ""),
        file: path.join(bucketDir, name),
      });
    }
  }
  return out;
}

// Parse a pattern file into the shape the fanout needs.
// Returns { slug, bucket, file, frontmatter, sections, markdown }.
function loadPatternFile(entry) {
  var raw = fs.readFileSync(entry.file, "utf8");
  var parsed = mdParser.parseGuidelineMarkdown(raw);
  var fm = parsePatternFrontmatter(parsed.frontmatter || "");
  return {
    slug: entry.slug,
    bucket: entry.bucket,
    file: entry.file,
    frontmatter: fm,
    sections: parsed.sections,
    markdown: parsed.markdown,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Fan-out resolution + application
// ───────────────────────────────────────────────────────────────────────────

// Given the set of pattern files and the index order from content-index.md,
// return them sorted by index order. Patterns missing from the index keep
// stable secondary order (alphabetical by slug, the listPatternFiles default).
function sortByIndexOrder(patterns, contentIndexOrder) {
  if (!contentIndexOrder || contentIndexOrder.length === 0) return patterns;
  var rank = new Map();
  contentIndexOrder.forEach(function (slug, i) {
    rank.set(slug, i);
  });
  return patterns.slice().sort(function (a, b) {
    var ra = rank.has(a.slug) ? rank.get(a.slug) : Number.MAX_SAFE_INTEGER;
    var rb = rank.has(b.slug) ? rank.get(b.slug) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.slug.localeCompare(b.slug);
  });
}

// Read content-index.md and return the ordered list of section slugs.
// Mirrors derive-content.js#readSectionOrder but slug-only and tolerant
// (returns [] if the file is absent — fanout still works, just without
// authored ordering).
function readContentIndexOrder(indexFile) {
  if (!fs.existsSync(indexFile)) return [];
  var md = fs.readFileSync(indexFile, "utf8");
  var hrefRe = /<a href="([^"]+)">[^<]+<\/a>/g;
  var seen = new Set();
  var order = [];
  var m;
  while ((m = hrefRe.exec(md))) {
    var slug = m[1].trim();
    if (seen.has(slug)) continue;
    seen.add(slug);
    order.push(slug);
  }
  return order;
}

// Resolve a pattern's fan-out set to the union of explicit components +
// category-expanded components. Validates every reference against the
// registry / categories. Resolves registry-alias keys (e.g. "input",
// "checkbox-with-label") to their canonical guideline slug (e.g.
// "text-input", "checkbox") so fan-out always lands on the canonical doc;
// the deriver's alias-copy pass then copies that doc to the alias keys
// automatically. Returns { slugs: Set, errors: [] } where slugs contains
// only canonical guideline slugs.
//
//   pattern              : { slug, frontmatter, ... } from loadPatternFile
//   registrySlugs        : Set<string> of valid registry component slugs
//   categoriesData       : { categories: { <CategoryName>: { components: [slug, ...] } } }
//   categorySlugFor      : function(categoryName) → kebab-case slug
//   registryAliases      : { <registryKey>: <canonicalGuidelineSlug> }
function resolveFanoutSet(
  pattern,
  registrySlugs,
  categoriesData,
  categorySlugFor,
  registryAliases,
) {
  registryAliases = registryAliases || {};
  var fm = pattern.frontmatter || {};
  var slugs = new Set();
  var errors = [];

  function addResolved(slug, source) {
    if (!SLUG_RE.test(slug)) {
      errors.push(
        "content/src/" +
          pattern.bucket +
          "/" +
          pattern.slug +
          ".md: " +
          source +
          " entry '" +
          slug +
          "' is not a valid slug",
      );
      return;
    }
    // Accept either a registry key OR a known alias target (canonical
    // guideline slug). Reject anything else.
    var isRegistryKey = registrySlugs.has(slug);
    var aliasTargets = Object.values(registryAliases);
    var isAliasTarget = aliasTargets.indexOf(slug) !== -1;
    if (!isRegistryKey && !isAliasTarget) {
      errors.push(
        "content/src/" +
          pattern.bucket +
          "/" +
          pattern.slug +
          ".md: " +
          source +
          " references unknown component slug '" +
          slug +
          "'",
      );
      return;
    }
    // Normalize to canonical: if slug is a registry-alias key, redirect to
    // its target. Otherwise leave as-is (already canonical or stand-alone
    // registry slug without an alias).
    var canonical = registryAliases[slug] || slug;
    slugs.add(canonical);
  }

  (fm.relatedComponents || []).forEach(function (slug) {
    addResolved(slug, "relatedComponents");
  });

  (fm.relatedCategories || []).forEach(function (catSlug) {
    if (!SLUG_RE.test(catSlug)) {
      errors.push(
        "content/src/" +
          pattern.bucket +
          "/" +
          pattern.slug +
          ".md: " +
          "relatedCategories entry '" +
          catSlug +
          "' is not a valid slug",
      );
      return;
    }
    var found = false;
    var catNames = Object.keys(categoriesData.categories || {});
    for (var i = 0; i < catNames.length; i++) {
      if (categorySlugFor(catNames[i]) !== catSlug) continue;
      found = true;
      var members = categoriesData.categories[catNames[i]].components || [];
      // Category members are registry keys — resolve each through aliases.
      members.forEach(function (m) {
        slugs.add(registryAliases[m] || m);
      });
      break;
    }
    if (!found) {
      errors.push(
        "content/src/" +
          pattern.bucket +
          "/" +
          pattern.slug +
          ".md: " +
          "relatedCategories references unknown category '" +
          catSlug +
          "'",
      );
    }
  });

  return { slugs: slugs, errors: errors };
}

// Drop every prior pattern-sourced section from a domain's sections[].
// Authored sections (no source field) are preserved untouched. Returns
// the filtered sections (does not mutate the input).
function dropPatternSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.filter(function (s) {
    return !s.source;
  });
}

// Stamp section.source onto each section before splicing into a component.
function stampSource(sections, sourceMarker) {
  return sections.map(function (s) {
    var copy = { heading: s.heading, source: sourceMarker, content: s.content };
    if (s.subsections) copy.subsections = s.subsections;
    return copy;
  });
}

// Apply pattern fan-out to a perComponent map. MUTATES the map.
//
// Inputs:
//   perComponent    : { <slug>: <guidelineDoc> } from derivePipeline
//   patterns        : pattern objects (sorted in fan-out order)
//   registry        : registry JSON (for synthesizing component names + categories
//                     when fanout creates a brand-new guideline doc)
//   categorySlugFor : function(categoryName) → kebab-case slug
//
// Returns a summary { stamped: [{slug, patternSlug, sectionCount}],
//                     synthesized: [slug] }.
//
// Behavior per related component:
//   - If perComponent[slug] exists: append pattern sections to
//     domains.content.sections[] (status preserved).
//   - If not: synthesize a minimal guideline doc with
//     domains.content.status = "synthesized" + the pattern sections.
//     meta.category is resolved from the registry entry.
function applyPatternFanout(perComponent, patterns, registry, categorySlugFor) {
  var summary = { stamped: [], synthesized: [] };
  var registryEntries = (registry && registry.components) || {};

  // First pass: drop existing pattern-sourced sections so the run is idempotent.
  // (perComponent entries are freshly built by derivePipeline each run, but
  // synthesized entries created by a PREVIOUS fanout pass live in dist/.
  // Since derivePipeline rebuilds from src/ only, they don't appear in
  // perComponent at all on the next run — they're orphans pruned by
  // cleanupStaleDistFiles. So this pass is defensive against partial state.)
  Object.keys(perComponent).forEach(function (slug) {
    var doc = perComponent[slug];
    if (!doc.domains || !doc.domains.content) return;
    if (Array.isArray(doc.domains.content.sections)) {
      doc.domains.content.sections = dropPatternSections(
        doc.domains.content.sections,
      );
    }
  });

  // Second pass: for each pattern, append source-stamped sections to every
  // related component (creating synthesized docs as needed).
  patterns.forEach(function (pattern) {
    if (!pattern.fanoutSlugs || pattern.fanoutSlugs.size === 0) return;
    var marker = "pattern:" + pattern.slug;
    var stamped = stampSource(pattern.sections, marker);

    var sortedSlugs = Array.from(pattern.fanoutSlugs).sort();
    sortedSlugs.forEach(function (slug) {
      var existing = perComponent[slug];
      if (existing) {
        // Component has its own guideline doc — augment it.
        if (!existing.domains.content) {
          existing.domains.content = {
            status: "synthesized",
            sections: stamped.slice(),
          };
          summary.stamped.push({
            slug: slug,
            patternSlug: pattern.slug,
            sectionCount: stamped.length,
          });
          return;
        }
        var d = existing.domains.content;
        d.sections = (d.sections || []).concat(stamped);
        // Status logic: authored content keeps its status; pattern-only
        // promotes to synthesized.
        if (d.status === "not-started" || d.status === "inherited") {
          d.status = "synthesized";
          // not-started + inherited never carry markdown; safe to add sections.
        }
        summary.stamped.push({
          slug: slug,
          patternSlug: pattern.slug,
          sectionCount: stamped.length,
        });
        return;
      }
      // No source-tree component dir: synthesize a guideline doc from
      // registry data so the docs site has a page to render.
      var regEntry = registryEntries[slug];
      if (!regEntry) {
        // Should be unreachable — resolveFanoutSet's CI gate rejects unknown slugs.
        throw new Error(
          "Pattern '" +
            pattern.slug +
            "' fans out to unknown component slug '" +
            slug +
            "' that resolveFanoutSet did not catch",
        );
      }
      perComponent[slug] = {
        _schema_version: 1,
        _meta: {
          auto_generated: true,
          source: "(patterns)",
          do_not_edit:
            "Edit the per-domain source files; CI regenerates this file.",
        },
        slug: slug,
        component: regEntry.name || slug,
        meta: {
          category: categorySlugFor(regEntry.category || ""),
        },
        domains: {
          content: {
            status: "synthesized",
            sections: stamped.slice(),
          },
        },
      };
      summary.synthesized.push(slug);
      summary.stamped.push({
        slug: slug,
        patternSlug: pattern.slug,
        sectionCount: stamped.length,
      });
    });
  });

  return summary;
}

// Top-level driver — what derive-guidelines invokes after building perComponent.
// Bundles file discovery + index ordering + per-pattern resolution + fan-out.
//
// repoRoot          : absolute path to the knowledge repo root
// perComponent      : the map derivePipeline built (will be mutated)
// registry          : parsed components/dist/registries/dskit.json
// categoriesData    : parsed components/dist/categories.json
// categorySlugFor   : kebab-case slugifier matching components/src/categories
// registryAliases   : { <registryKey>: <canonicalGuidelineSlug> } from
//                     paths-manifest.json — normalizes alias keys (e.g. "input")
//                     to canonicals (e.g. "text-input") so fan-out lands on the
//                     canonical doc; the deriver's alias-copy pass propagates
//                     the fanned content to the alias keys automatically
//
// Returns { errors: [string], summary: {...} }.
function runFanout(
  repoRoot,
  perComponent,
  registry,
  categoriesData,
  categorySlugFor,
  registryAliases,
) {
  var contentSrcRoot = path.join(repoRoot, "content", "src");
  var entries = listPatternFiles(contentSrcRoot);
  if (entries.length === 0) {
    return { errors: [], summary: { stamped: [], synthesized: [] } };
  }

  var registrySlugs = new Set(
    Object.keys((registry && registry.components) || {}),
  );

  var patterns = entries.map(loadPatternFile);
  var allErrors = [];

  // Resolve each pattern's fan-out set up-front so errors aggregate before
  // any mutation occurs.
  patterns.forEach(function (p) {
    var res = resolveFanoutSet(
      p,
      registrySlugs,
      categoriesData,
      categorySlugFor,
      registryAliases || {},
    );
    p.fanoutSlugs = res.slugs;
    allErrors = allErrors.concat(res.errors);
  });

  if (allErrors.length > 0) {
    return { errors: allErrors, summary: { stamped: [], synthesized: [] } };
  }

  var indexOrder = readContentIndexOrder(
    path.join(contentSrcRoot, "content-index.md"),
  );
  var ordered = sortByIndexOrder(patterns, indexOrder);

  var summary = applyPatternFanout(
    perComponent,
    ordered,
    registry,
    categorySlugFor,
  );
  return { errors: [], summary: summary };
}

module.exports = {
  PATTERN_BUCKETS: PATTERN_BUCKETS,
  parsePatternFrontmatter: parsePatternFrontmatter,
  listPatternFiles: listPatternFiles,
  loadPatternFile: loadPatternFile,
  readContentIndexOrder: readContentIndexOrder,
  sortByIndexOrder: sortByIndexOrder,
  resolveFanoutSet: resolveFanoutSet,
  dropPatternSections: dropPatternSections,
  stampSource: stampSource,
  applyPatternFanout: applyPatternFanout,
  runFanout: runFanout,
};
