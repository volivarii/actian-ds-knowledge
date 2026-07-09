// Shared, tolerant frontmatter splitter. Returns null `data` on a missing or
// unparseable frontmatter block so callers can degrade gracefully (e.g. the
// category editor falls back to a raw markdown editor). Lifted from the
// markdown Preview pane so both consumers share one implementation.
import { parseYaml } from "../form-engine/yamlSerializer";

export interface SplitFrontmatter {
  data: Record<string, unknown> | null;
  body: string;
  /** Raw YAML text between the fences (no `---`), or null when absent. */
  frontmatterText: string | null;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Routing classifier for the frontmatter form screen. Distinguishes the two
 * `data === null` cases so the UI can degrade gracefully:
 *   - `"form"`          — a fenced block that parses to an object.
 *   - `"no-frontmatter"`— no `---` fence at all (a plain markdown file; NOT an
 *                         error — edit as raw markdown with no banner).
 *   - `"malformed"`     — a `---` fence is present (leading whitespace tolerated)
 *                         but the block did not parse; show the parse-error banner.
 */
export type FrontmatterClass = "form" | "no-frontmatter" | "malformed";

export function classifyFrontmatter(text: string): FrontmatterClass {
  if (splitFrontmatter(text).data !== null) return "form";
  return text.trimStart().startsWith("---") ? "malformed" : "no-frontmatter";
}

/**
 * Decide the fallback UI state for a file whose frontmatter did NOT parse to an
 * object (i.e. `splitFrontmatter().data === null`), honoring whether the domain
 * treats frontmatter as OPTIONAL:
 *   - a broken `---` fence ("malformed") always warns → `"raw"`;
 *   - a file with NO fence in a PROSE domain (content, foundations —
 *     `frontmatterOptional: true`) is a plain markdown file → `"no-frontmatter"`
 *     (open silently, no banner);
 *   - a file with NO fence in a RECORD domain (app-context, categories,
 *     words-to-avoid — frontmatter REQUIRED) is missing something it needs →
 *     `"raw"` (keep the missing-frontmatter warning + raw fallback).
 * Pure so the routing decision is unit-testable without rendering.
 */
export function routeNoFrontmatter(
  text: string,
  frontmatterOptional: boolean,
): "raw" | "no-frontmatter" {
  if (classifyFrontmatter(text) === "malformed") return "raw";
  return frontmatterOptional ? "no-frontmatter" : "raw";
}

export function splitFrontmatter(text: string): SplitFrontmatter {
  if (!text.startsWith("---"))
    return { data: null, body: text, frontmatterText: null };
  const match = text.match(FRONTMATTER_RE);
  if (!match || match[1] === undefined) {
    return { data: null, body: text, frontmatterText: null };
  }
  const frontmatterText = match[1];
  try {
    const data = parseYaml(frontmatterText);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { data: null, body: text, frontmatterText: null };
    }
    return {
      data: data as Record<string, unknown>,
      body: text.slice(match[0].length),
      frontmatterText,
    };
  } catch {
    return { data: null, body: text, frontmatterText: null };
  }
}
