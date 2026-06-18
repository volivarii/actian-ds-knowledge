// Loader for the union of "known component slugs" — the option set for
// the RelatedMultiSelectWidget.
//
// Sources:
//   - Authored components: every components/src/<slug>/ dir (excluding
//     the special categories/ + guidelines/ folders).
//   - Registry: every DS Kit eligible (non-icon) registry key.
//
// The union surfaces both already-authored slugs AND registry slugs the
// author might cross-reference (even if not yet authored). Deduped and
// sorted. Cached per-session (5-min TTL).

import type { Octokit } from "@octokit/rest";
import { getTextFile, listDirectories } from "../app/githubApi";
import { EXCLUDED_CATEGORY_LABELS } from "../substrate/graphEligibility";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEY = "editor:component-slugs:v1";
const SKIP_DIRS = new Set(["categories", "guidelines"]);
const DSKIT_REGISTRY_PATH = "components/dist/registries/dskit.json";

interface CachedEntry {
  slugs: string[];
  fetchedAt: number;
}

export async function loadComponentSlugs(gh: Octokit): Promise<string[]> {
  const cached = readCache();
  if (cached) return cached.slugs;
  try {
    const [dirs, registry] = await Promise.all([
      listDirectories(gh, "components/src").catch(() => [] as string[]),
      loadRegistryEligibleSlugs(gh),
    ]);
    const authored = dirs.filter((d) => !SKIP_DIRS.has(d));
    const merged = Array.from(new Set([...authored, ...registry])).sort();
    writeCache(merged);
    return merged;
  } catch {
    return [];
  }
}

async function loadRegistryEligibleSlugs(gh: Octokit): Promise<string[]> {
  try {
    const text = await getTextFile(gh, DSKIT_REGISTRY_PATH);
    const parsed = JSON.parse(text) as {
      components?: Record<string, { category?: string }>;
    };
    const out: string[] = [];
    for (const [slug, entry] of Object.entries(parsed.components ?? {})) {
      const cat = entry?.category ?? "uncategorized";
      if (!EXCLUDED_CATEGORY_LABELS.has(cat)) out.push(slug);
    }
    return out;
  } catch {
    return [];
  }
}

function readCache(): CachedEntry | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (
      typeof parsed?.fetchedAt !== "number" ||
      Date.now() - parsed.fetchedAt > CACHE_TTL_MS ||
      !Array.isArray(parsed.slugs)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(slugs: string[]): void {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ slugs, fetchedAt: Date.now() }),
    );
  } catch {
    /* silent */
  }
}
