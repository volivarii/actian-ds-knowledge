// "Open in Figma" for component links, built from the registry the nightly
// sync writes (dskit.json: top-level fileKey, components[slug].nodeId).
import type { Octokit } from "@octokit/rest";
import { getTextFile } from "../../app/githubApi";

const DSKIT = "components/dist/registries/dskit.json";

export function figmaUrl(fileKey: string, nodeId: string): string {
  return `https://www.figma.com/design/${fileKey}/?node-id=${nodeId.replace(":", "-")}`;
}

let cache: Promise<Map<string, string>> | null = null;

/** Component slug -> Figma URL, read once per session. A failed read yields an
 *  empty map (no Figma buttons) and is retried on the next call. */
export function loadFigmaUrls(gh: Octokit): Promise<Map<string, string>> {
  cache ??= getTextFile(gh, DSKIT)
    .then((t) => {
      const reg = JSON.parse(t) as { fileKey?: string; components?: Record<string, { nodeId?: string }> };
      const out = new Map<string, string>();
      if (!reg.fileKey) return out;
      for (const [slug, c] of Object.entries(reg.components ?? {}))
        if (c.nodeId) out.set(slug, figmaUrl(reg.fileKey, c.nodeId));
      return out;
    })
    .catch(() => {
      cache = null;
      return new Map<string, string>();
    });
  return cache;
}
