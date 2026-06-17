// Synchronous taxonomy builder over the static JSON imports in
// taxonomyAssets.ts. Mirrors loadTaxonomy()'s in-memory shape but does
// not need async/fs — the JSON is bundled at build time.
//
// Used by the editor UI to power Section Inspector connections + Topic
// Picker search WITHOUT a runtime fetch. The trade-off is that taxonomy
// freshness is gated on the editor build cadence (see taxonomyAssets.ts
// for the rationale).

import type { Domain, SearchResult, Taxonomy, Tier } from "./taxonomy";
import {
  a11yIndex,
  componentNodes,
  contentTopicNodes,
  foundationSections,
  motionPatterns,
} from "./taxonomyAssets";

export function buildTaxonomyFromAssets(): Taxonomy {
  const a11yBySlug = new Map<
    string,
    { title: string; body: string | null; tier: Tier | null }
  >();
  for (const section of a11yIndex.sections ?? []) {
    // Real dist/a11y-index.json carries body_excerpt; test fixtures use
    // body. Coalesce so the picker can surface a snippet from either.
    const body = section.body ?? section.body_excerpt ?? null;
    a11yBySlug.set(section.slug, {
      title: section.title,
      body,
      tier: section.tier ?? null,
    });
  }

  const motionBySlug = new Map<
    string,
    { title: string; body: string | null; tier: Tier | null }
  >();
  for (const pattern of Object.values(motionPatterns.patterns ?? {})) {
    motionBySlug.set(pattern.slug, {
      title: pattern.name,
      body: pattern.description ?? null,
      tier: null,
    });
  }

  // Foundation sections from the graph corpus. New node types get
  // tier:null, body:null — we deliberately preserve the a11y tier/body
  // values (consumed by A11yRefsWidget/TopicResultRow) while adding graph
  // nodes alongside.
  const foundationsBySlug = new Map<
    string,
    { title: string; body: string | null; tier: Tier | null }
  >();
  for (const section of foundationSections) {
    foundationsBySlug.set(section.slug, {
      title: section.title,
      body: null,
      tier: null,
    });
  }

  // Component and content-topic nodes from the graph corpus.
  const componentsBySlug = new Map<
    string,
    { title: string; body: string | null; tier: Tier | null }
  >();
  for (const node of componentNodes) {
    componentsBySlug.set(node.slug, {
      title: node.title,
      body: null,
      tier: null,
    });
  }

  const contentTopicsBySlug = new Map<
    string,
    { title: string; body: string | null; tier: Tier | null }
  >();
  for (const node of contentTopicNodes) {
    contentTopicsBySlug.set(node.slug, {
      title: node.title,
      body: null,
      tier: null,
    });
  }

  function getMap(
    domain: Domain,
  ): Map<string, { title: string; body: string | null; tier: Tier | null }> {
    switch (domain) {
      case "accessibility":
        return a11yBySlug;
      case "motion":
        return motionBySlug;
      case "foundations":
        return foundationsBySlug;
      case "component":
        return componentsBySlug;
      case "content":
        return contentTopicsBySlug;
      default: {
        // Exhaustiveness guard: TypeScript will flag unhandled Domain values.
        const _never: never = domain;
        // Return empty map so unknown domains fail loudly (no data) rather
        // than silently returning wrong data.
        void _never;
        return new Map();
      }
    }
  }

  return {
    getSlugs(domain) {
      return Array.from(getMap(domain).keys());
    },
    getTitle(domain, slug) {
      return getMap(domain).get(slug)?.title ?? null;
    },
    getBody(domain, slug) {
      return getMap(domain).get(slug)?.body ?? null;
    },
    getTier(domain, slug) {
      return getMap(domain).get(slug)?.tier ?? null;
    },
    domainOfSlug(slug) {
      if (a11yBySlug.has(slug)) return "accessibility";
      if (motionBySlug.has(slug)) return "motion";
      if (foundationsBySlug.has(slug)) return "foundations";
      if (componentsBySlug.has(slug)) return "component";
      if (contentTopicsBySlug.has(slug)) return "content";
      return null;
    },
    searchSections(query, opts) {
      const q = query.toLowerCase().trim();
      if (q === "") return [];
      const limit = opts?.limit ?? 20;
      const out: SearchResult[] = [];
      const scopes: Domain[] = opts?.domain
        ? [opts.domain]
        : ["accessibility", "motion", "foundations", "component", "content"];
      for (const domain of scopes) {
        for (const [slug, entry] of getMap(domain)) {
          const haystack = `${entry.title} ${entry.body ?? ""}`.toLowerCase();
          if (haystack.includes(q)) {
            out.push({
              slug,
              domain,
              title: entry.title,
              body: entry.body,
              tier: entry.tier ?? null,
            });
            if (out.length >= limit) return out;
          }
        }
      }
      return out;
    },
  };
}
