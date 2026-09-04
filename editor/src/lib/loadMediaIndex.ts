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
// loadMediaCapture below is the consumer-side read of them.
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
      (err as { status?: number }).status === 404
        ? "not found"
        : (err as Error).message;
    throw new Error(`Could not read ${INDEX_PATH}: ${why}`);
  }
  let json: { media?: MediaMap };
  try {
    json = JSON.parse(text) as { media?: MediaMap };
  } catch (err) {
    throw new Error(`${INDEX_PATH} is not JSON: ${(err as Error).message}`);
  }
  const media = json.media ?? {};
  // A well-formed index carrying no entries at all (re-derived under another
  // top-level key, or shipped as a bare map) is not "no component has media".
  // Checked HERE, before the cache, so every reader meets the same failure.
  // When only loadCapturedSlugs checked, it dropped the Capture Meter while
  // the render panel and the media picker had already cached the empty map
  // and went on reporting "no capture" for every component, and the two
  // then alternated between clearing the cache and re-poisoning it.
  if (Object.keys(media).length === 0) {
    throw new Error(
      `${INDEX_PATH} carried no media entries, so the index cannot be read; ` +
        `that is not the same as no component having a capture`,
    );
  }
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

/** Which capture loadMediaCapture found, so the caller can name what it shows. */
export type CaptureRole = "default" | "preview";

export interface MediaCapture {
  /** Repo-relative .webp path. */
  path: string;
  role: CaptureRole;
}

/**
 * Consumer-side: the Figma capture to show beside a component's render.
 * The isolated `default` variant first, the doc page's `preview` frame second,
 * null when the index holds neither. Same session cache as the author roles.
 *
 * The order matters and used to be the other way round. The panel puts this
 * beside the canonical render and tells the author that where the two disagree,
 * the render is what needs fixing — a claim that only holds if both show the
 * same subject. `default` is the component's default variant captured in
 * isolation: the fidelity oracle, and the render's like-for-like counterpart.
 * `preview` is the component's Figma doc page, a whole page of variants at page
 * scale, so a render compared against it disagrees for reasons that are not
 * defects. 198 slugs carry `default` and 88 carry `preview`, so preferring
 * `preview` meant the same column silently meant two different things depending
 * on which component was open. The role comes back so the panel can say which.
 */
export async function loadMediaCapture(
  gh: Octokit,
  slug: string,
): Promise<MediaCapture | null> {
  if (!slug) return null;
  const media = await loadIndex(gh);
  const entry = media[slug];
  if (!entry) return null;
  for (const role of ["default", "preview"] as const) {
    const pick = entry[role];
    if (typeof pick === "string" && pick.length > 0)
      return { path: pick, role };
  }
  return null;
}

/**
 * The slugs with an isolated `default` capture — the set the Component Capture
 * Slot measures against.
 *
 * Propagates rather than returning an empty set, on purpose and consistently
 * with `loadMediaCapture` above: a failed read is not evidence that no
 * component has a capture. The caller decides what an unmeasurable index means
 * for its surface; here it is `componentSlotsFor(false)`, which drops the Slot.
 */
export async function loadCapturedSlugs(gh: Octokit): Promise<Set<string>> {
  // An index carrying no entries at all throws inside `loadIndex`, before it
  // is cached, so the Slot is dropped here and the other two readers see the
  // same failure instead of a cached "no media". Only a THROW drops the Slot.
  const media = await loadIndex(gh);
  return new Set(
    Object.entries(media)
      // `MediaMap` values are `string | string[]`. `default` is a single
      // capture today, but reading only the string form would silently report
      // "no capture" if it ever became a list.
      .filter(([, roles]) => {
        const d = roles?.default;
        return typeof d === "string" ? d.length > 0 : Array.isArray(d) && d.length > 0;
      })
      .map(([slug]) => slug),
  );
}
