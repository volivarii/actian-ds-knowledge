// Content search source. The knowledge graph's content:* nodes come from the
// DERIVED content bundle, not the content/src files, so they cannot open a file.
// Search sources content from a real listing of the three content/src dirs
// instead (the same dirs anchorIndex lists). Pure mapping + a thin cached fetch.
import type { Octokit } from "@octokit/rest";
import { listFilesByGlob } from "../app/githubApi";

export interface ContentFile {
  title: string;
  path: string;
}

const CONTENT_DIRS = ["writing", "patterns", "product"] as const;
type ContentDir = (typeof CONTENT_DIRS)[number];

export function humanizeSlug(slug: string): string {
  const s = slug.replace(/-/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Pure: per-dir markdown filenames -> titled ContentFile entries (skips
 *  AUTHORING.md and any non-.md file). */
export function contentFilesFromListing(
  listing: { dir: ContentDir; files: string[] }[],
): ContentFile[] {
  const out: ContentFile[] = [];
  for (const { dir, files } of listing) {
    for (const file of files) {
      if (!file.endsWith(".md") || file === "AUTHORING.md") continue;
      const slug = file.replace(/\.md$/, "");
      out.push({ title: humanizeSlug(slug), path: `content/src/${dir}/${file}` });
    }
  }
  return out;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; files: ContentFile[] } | null = null;

export async function loadContentFiles(gh: Octokit): Promise<ContentFile[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.files;
  const listing = await Promise.all(
    CONTENT_DIRS.map(async (dir) => ({
      dir,
      files: await listFilesByGlob(gh, `content/src/${dir}`, {
        extension: ".md",
        exclude: ["AUTHORING.md"],
      }).catch(() => [] as string[]),
    })),
  );
  const files = contentFilesFromListing(listing);
  cache = { at: Date.now(), files };
  return files;
}
