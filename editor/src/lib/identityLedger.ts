// Slug resolution through the identity ledger (components/dist/identity.json,
// CI-derived). A component keeps its authored directory across a Figma rename
// while every derived surface (render dist, media index, registries) files it
// under the NEW slug, so any editor surface that joins an authored slug to a
// derived one must resolve through the ledger first, or a rename reads as an
// absence ("no render for tooltip" while fragments/tooltip-default.html exists).
import type { Octokit } from "@octokit/rest";
import { getTextFile } from "../app/githubApi";
import { memoizeByInstance } from "./memoizeByInstance";

export const LEDGER_PATH = "components/dist/identity.json";

interface LedgerEntry {
  slug?: unknown;
  previousSlugs?: unknown;
}

async function fetchRenameIndex(gh: Octokit): Promise<Map<string, string>> {
  let text: string;
  try {
    text = await getTextFile(gh, LEDGER_PATH);
  } catch (err) {
    const why =
      (err as { status?: number }).status === 404 ? "not found" : (err as Error).message;
    throw new Error(`Could not read ${LEDGER_PATH}: ${why}`);
  }
  let json: { entries?: Record<string, LedgerEntry> };
  try {
    json = JSON.parse(text) as { entries?: Record<string, LedgerEntry> };
  } catch (err) {
    throw new Error(`${LEDGER_PATH} is not JSON: ${(err as Error).message}`);
  }
  const index = new Map<string, string>();
  for (const entry of Object.values(json.entries ?? {})) {
    if (typeof entry.slug !== "string" || !Array.isArray(entry.previousSlugs)) continue;
    for (const prev of entry.previousSlugs) {
      if (typeof prev === "string" && prev && prev !== entry.slug) index.set(prev, entry.slug);
    }
  }
  return index;
}

/** previousSlug -> current slug, memoized per client for 5 minutes. */
export const loadRenameIndex = memoizeByInstance<Octokit, Map<string, string>>(
  fetchRenameIndex,
  { ttlMs: 5 * 60 * 1000 },
);

/** The slug the derived surfaces file `slug` under today: itself, unless the
 *  ledger records it as a previous name of something. */
export async function resolveCurrentSlug(gh: Octokit, slug: string): Promise<string> {
  const index = await loadRenameIndex(gh);
  return index.get(slug) ?? slug;
}
