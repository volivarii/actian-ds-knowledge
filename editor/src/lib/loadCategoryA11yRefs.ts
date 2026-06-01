import type { Octokit } from "@octokit/rest";
import { getTextFile } from "../app/githubApi";

// Returns the a11y ref slugs a component inherits from its category — the
// a11y_refs.requirementRefs[].ref of components/dist/categories/<cat>-defaults.json.
// Returns [] on any miss (unset category, 404, parse error) so the caller hides
// the context line gracefully.
export async function loadCategoryA11yRefs(
  octokit: Octokit,
  category: string,
): Promise<string[]> {
  if (!category) return [];
  try {
    const text = await getTextFile(
      octokit,
      `components/dist/categories/${category}-defaults.json`,
    );
    const json = JSON.parse(text) as {
      a11y_refs?: { requirementRefs?: { ref: string }[] };
    };
    return (json.a11y_refs?.requirementRefs ?? []).map((r) => r.ref);
  } catch {
    return [];
  }
}
