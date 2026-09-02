// Media index loader — used by the MediaPickerPopover to offer the
// author-placeable media roles that actually have captured imagery for a
// component. Source of truth: components/dist/media/_index.json (CI-derived;
// slug → role → path(s)). Authors reference media by ROLE, never by path.
//
// Cached per-session (5-min TTL); sessionStorage-backed (mirrors categoriesLoader).

import type { Octokit } from "@octokit/rest";
import { getTextFile } from "../app/githubApi";

// The roles an author may place in a guideline (schema enum at
// schemas/guideline-component.json). preview/default are consumer-side
// (hero thumbnail / fidelity oracle) and are intentionally excluded here;
// loadMediaPreviewPath below is the consumer-side read of them.
export const AUTHOR_ROLES = [
  "parts",
  "variations",
  "spacing",
  "behavior",
  "layout",
] as const;
export type MediaRole = (typeof AUTHOR_ROLES)[number];

export interface MediaRoleEntry {
  role: MediaRole;
  /** 1+ repo-relative .webp paths (for thumbnails only — never stored). */
  paths: string[];
  /** true when the role is array-valued (multiple captures). */
  multi: boolean;
}

const INDEX_PATH = "components/dist/media/_index.json";
const CACHE_KEY = "editor:media-index:v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

type MediaMap = Record<string, Record<string, string | string[]>>;

interface CachedEntry {
  media: MediaMap;
  fetchedAt: number;
}

export async function loadMediaRoles(
  gh: Octokit,
  slug: string,
): Promise<MediaRoleEntry[]> {
  if (!slug) return [];
  let media: MediaMap;
  try {
    media = await loadIndex(gh);
  } catch {
    return []; // the picker offers nothing rather than blocking authoring
  }
  const entry = media[slug];
  if (!entry) return [];
  const out: MediaRoleEntry[] = [];
  // Iterate AUTHOR_ROLES (not Object.keys) so the offered order is stable
  // and preview/default can never leak in.
  for (const role of AUTHOR_ROLES) {
    const value = entry[role];
    if (value === undefined) continue;
    const paths = Array.isArray(value) ? value : [value];
    if (paths.length === 0) continue;
    out.push({ role, paths, multi: Array.isArray(value) });
  }
  return out;
}

// Throws, naming the index, when it cannot be read: a failed read must not
// come back as "this component has no media". loadMediaRoles keeps its lenient
// shape (an empty picker), the consumer-side read below propagates.
async function loadIndex(gh: Octokit): Promise<MediaMap> {
  const cached = readCache();
  if (cached) return cached.media;
  let text: string;
  try {
    text = await getTextFile(gh, INDEX_PATH);
  } catch (err) {
    const why =
      (err as { status?: number }).status === 404 ? "not found" : (err as Error).message;
    throw new Error(`Could not read ${INDEX_PATH}: ${why}`);
  }
  let json: { media?: MediaMap };
  try {
    json = JSON.parse(text) as { media?: MediaMap };
  } catch (err) {
    throw new Error(`${INDEX_PATH} is not JSON: ${(err as Error).message}`);
  }
  const media = json.media ?? {};
  writeCache(media);
  return media;
}

function readCache(): CachedEntry | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (
      typeof parsed?.fetchedAt !== "number" ||
      Date.now() - parsed.fetchedAt > CACHE_TTL_MS ||
      typeof parsed.media !== "object"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(media: MediaMap): void {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ media, fetchedAt: Date.now() }),
    );
  } catch {
    /* silent */
  }
}

/**
 * Consumer-side: the Figma capture to show beside a component's render.
 * The `preview` frame first, the isolated `default` variant second, null when
 * the index holds neither. Same session cache as the author roles.
 */
export async function loadMediaPreviewPath(
  gh: Octokit,
  slug: string,
): Promise<string | null> {
  if (!slug) return null;
  const media = await loadIndex(gh);
  const entry = media[slug];
  if (!entry) return null;
  const pick = entry.preview ?? entry.default;
  return typeof pick === "string" && pick.length > 0 ? pick : null;
}
