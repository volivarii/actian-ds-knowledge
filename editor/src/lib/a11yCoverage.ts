import type { Octokit } from "@octokit/rest";
import { listFilesByGlob, getTextFile } from "../app/githubApi";
import { buildTaxonomyFromAssets } from "../substrate/buildTaxonomyFromAssets";
import type { Taxonomy } from "../substrate/taxonomy";
import type { CoverageRow } from "./coverageLoader";

export type TopicState = "well-hosted" | "single-host" | "category-only" | "orphan";

export interface TopicHost {
  slug: string;
  name: string;
}

export interface TopicCoverage {
  slug: string;
  title: string;
  componentHosts: TopicHost[];
  categoryHosts: string[];
  state: TopicState;
}

export interface ThinComponent {
  slug: string;
  component: string;
}

// Read every components/dist/categories/<cat>-defaults.json and return a map
// topicSlug -> [categorySlug, …] from each file's a11y_refs.requirementRefs.
export async function loadCategoryPatternRefs(
  gh: Octokit,
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  let files: string[];
  try {
    files = await listFilesByGlob(gh, "components/dist/categories", {
      extension: "-defaults.json",
    });
  } catch {
    return out;
  }
  for (const f of files) {
    const catSlug = f.replace(/-defaults\.json$/, "");
    try {
      const text = await getTextFile(gh, `components/dist/categories/${f}`);
      const json = JSON.parse(text) as {
        a11y_refs?: { requirementRefs?: { ref: string }[] };
      };
      for (const r of json.a11y_refs?.requirementRefs ?? []) {
        (out[r.ref] ??= []).push(catSlug);
      }
    } catch {
      // skip unreadable category file
    }
  }
  return out;
}

const STATE_ORDER: Record<TopicState, number> = {
  orphan: 0,
  "category-only": 1,
  "single-host": 2,
  "well-hosted": 3,
};

export function computeTopicCoverage(
  rows: CoverageRow[],
  categoryRefs: Record<string, string[]>,
  taxonomy: Taxonomy = buildTaxonomyFromAssets(),
): TopicCoverage[] {
  const topics = taxonomy
    .getSlugs("accessibility")
    .filter((s) => taxonomy.getTier("accessibility", s) === "component-pattern");

  const result: TopicCoverage[] = topics.map((slug) => {
    const componentHosts: TopicHost[] = rows
      .filter((r) => r.a11yRefs.includes(slug))
      .map((r) => ({ slug: r.slug, name: r.component }));
    const categoryHosts = categoryRefs[slug] ?? [];
    let state: TopicState;
    if (componentHosts.length >= 2) state = "well-hosted";
    else if (componentHosts.length === 1) state = "single-host";
    else if (categoryHosts.length > 0) state = "category-only";
    else state = "orphan";
    return {
      slug,
      title: taxonomy.getTitle("accessibility", slug) ?? slug,
      componentHosts,
      categoryHosts,
      state,
    };
  });

  return result.sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      a.title.localeCompare(b.title),
  );
}

export function thinComponents(rows: CoverageRow[]): ThinComponent[] {
  return rows
    .filter((r) => r.origin === "authored" && r.a11yRefs.length === 0)
    .map((r) => ({ slug: r.slug, component: r.component }));
}
