// Coverage loader for the editor's landing dashboard.
//
// Reads every `components/src/<slug>/_meta.yml` (the 26 "authored" set)
// AND the DS Kit registry (`components/dist/registries/dskit.json`) to
// produce a merged view: authored rows + ghost rows for registry
// components that have no _meta.yml yet. Ghost rows offer the
// Start-authoring action (stub _meta.yml → submission cart).
//
// Eligibility filter: `isRegistryComponent` (shared from
// src/substrate/graphEligibility.ts) keeps only entries whose registry `section`
// is "Components". Icons and grids are Foundations, logos and illustrations are
// Brand Assets, and none of them are components awaiting guidance. That is 73
// eligible registry components today, and the number follows Figma rather than a
// list somebody has to remember to update.
//
// Known debt (NOT solved here): the F1 alias mismatch — 5 _meta slugs
// alias to multi-key registry entries (e.g. `tag` ↔ `tag-read-only`,
// `tag-interactive`, etc.); 6 _meta slugs don't appear in DS Kit
// registry at all. Ghost rendering is by registry slug; this surfaces
// the alias question to the author rather than solving it implicitly.

import type { Octokit } from "@octokit/rest";
import { parse as parseYaml } from "yaml";
import { listDirectories, getTextFile } from "../app/githubApi";
import { DOMAINS, domainFileName, type Domain } from "./workspaceState";
import { memoizeByInstance } from "./memoizeByInstance";
import { isRegistryComponent } from "../substrate/graphEligibility";

// One tuple, owned by workspaceState, which also names the file each domain
// lives in. A second copy here compiled and passed every guard, while a domain
// added on one side would have gone unmeasured on the other.
export { DOMAINS, type Domain } from "./workspaceState";

export const STATUSES = [
  "not-started",
  "draft",
  "approved",
  "inherited",
] as const;
export type Status = (typeof STATUSES)[number];

export interface DomainEntry {
  status: Status;
  owner?: string;
  updatedAt?: string;
}

export type RowOrigin = "authored" | "unstarted";

export interface CoverageRow {
  slug: string;
  component: string;
  category?: string;
  domains: Record<Domain, DomainEntry>;
  a11yRefs: string[];
  /** authored = has _meta.yml; unstarted = in DS Kit registry but no _meta.yml */
  origin: RowOrigin;
  /** registry key (when origin === "unstarted") — used for stub generation */
  registryKey?: string;
  /**
   * True when the row's `_meta.yml` could not be READ (403/500/rate limit/bad
   * YAML) as opposed to not existing. Such a row carries blank domains that are
   * a placeholder, not a measurement. It never leaves the loader: `fetchCoverage`
   * moves it out of `rows` and into `CoverageResult.unreadable`, so no consumer
   * has to remember to exclude it. Six of them count rows; one remembered.
   */
  unreadable?: boolean;
}

export interface CoverageResult {
  /** Every row whose facts were READ: authored rows plus registry ghosts. */
  rows: CoverageRow[];
  /**
   * Slugs whose `_meta.yml` answered anything but 404, sorted. Not in `rows`,
   * so a screen counting rows cannot count one as five empty domains. Named,
   * so the screen can say which file to go and look at.
   */
  unreadable: string[];
}

const SKIP_DIRS = new Set(["categories", "guidelines"]);

const DSKIT_REGISTRY_PATH = "components/dist/registries/dskit.json";

interface DskitEntry {
  name: string;
  category?: string;
  group?: string;
  section?: string;
}

// Memoized per Octokit instance. A full load is ~30-90 GitHub API calls,
// and three surfaces share it (HomeScreen, CoverageDashboard,
// A11yCoverageDashboard) — same TTL precedent as categoriesLoader.
// Coverage is merge-driven data, so the TTL is the whole staleness story:
// no force/invalidation hook (a refresh right after submitting would show
// nothing new — the PR isn't merged). A DEGRADED crawl is retryable and must
// not be pinned: an empty result almost always means a rate limit rather than
// a truly empty repo, and a crawl with unreadable rows is the same event
// caught one file at a time. Pinning either served the "N could not be read"
// note, and the smaller denominators behind it, for the whole TTL.
export const loadCoverage = memoizeByInstance<Octokit, CoverageResult>(
  fetchCoverage,
  {
    ttlMs: 5 * 60 * 1000,
    isRetryable: (r) => r.rows.length === 0 || r.unreadable.length > 0,
  },
);

async function fetchCoverage(gh: Octokit): Promise<CoverageResult> {
  const [dirs, registry] = await Promise.all([
    listDirectories(gh, "components/src"),
    loadDskitEligible(gh),
  ]);
  const componentDirs = dirs.filter((d) => !SKIP_DIRS.has(d));
  const authoredSlugs = new Set(componentDirs);

  const loaded = await Promise.all(
    componentDirs.map((slug) => loadOne(gh, slug)),
  );
  // Partitioned ONCE, here. A row that could not be read is not a row with
  // five empty domains, and every consumer that counts rows (the Meters,
  // summarize, the front door's gap list, the a11y thin list, the table) would
  // otherwise have to remember that on its own. One did.
  const unreadable = loaded
    .filter((r) => r.unreadable)
    .map((r) => r.slug)
    .sort();
  const authored = loaded.filter((r) => !r.unreadable);

  const ghosts: CoverageRow[] = Object.entries(registry)
    .filter(([slug]) => !authoredSlugs.has(slug))
    .map(([slug, entry]) => ({
      slug,
      component: entry.name,
      category: deriveCategorySlug(entry.category),
      domains: blankDomains(),
      a11yRefs: [],
      origin: "unstarted" as const,
      registryKey: slug,
    }));

  const merged: CoverageRow[] = [...authored, ...ghosts];
  return {
    rows: merged.sort((a, b) => a.slug.localeCompare(b.slug)),
    unreadable,
  };
}

async function loadDskitEligible(
  gh: Octokit,
): Promise<Record<string, DskitEntry>> {
  // No fallback. The registry IS the eligible set, the denominator of every
  // Component Meter, and this used to return {} on any failure: a 403 on one
  // file shrank "of 74" to "of 54" with a measured date beside it and nothing
  // said, one call above the per-row fallback that had just been fixed for
  // the same lie. A load that cannot read the registry has not measured
  // coverage; it rejects, naming the file, and the screens show that.
  let text: string;
  try {
    text = await getTextFile(gh, DSKIT_REGISTRY_PATH);
  } catch (err) {
    throw new Error(
      `Could not read ${DSKIT_REGISTRY_PATH}: ${(err as Error).message}`,
    );
  }
  let parsed: { components?: Record<string, DskitEntry> };
  try {
    parsed = JSON.parse(text) as { components?: Record<string, DskitEntry> };
  } catch (err) {
    throw new Error(
      `${DSKIT_REGISTRY_PATH} is not JSON: ${(err as Error).message}`,
    );
  }
  const out: Record<string, DskitEntry> = {};
  for (const [slug, entry] of Object.entries(parsed.components ?? {})) {
    if (!isRegistryComponent(entry)) continue;
    out[slug] = entry;
  }
  return out;
}

// Registry categories are human-readable (e.g. "Form (input & selection)").
// _meta.yml `category` fields are slugs (e.g. "form-input-selection").
// Slugify so stub _meta.yml files validate against schema.
function deriveCategorySlug(cat?: string): string | undefined {
  if (!cat) return undefined;
  return cat
    .toLowerCase()
    .replace(/[()&,]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function loadOne(gh: Octokit, slug: string): Promise<CoverageRow> {
  try {
    const yamlText = await getTextFile(gh, `components/src/${slug}/_meta.yml`);
    // An empty or comment-only file parses to null. That is a file somebody
    // created and wrote nothing into: the same fact as a 404, five empty
    // domains, and not a read that failed. Without the fallback `parseRow`
    // threw on it and the row was reported as unreadable, permanently, for a
    // file that read fine.
    const parsed = (parseYaml(yamlText) ?? {}) as Record<string, unknown>;
    return parseRow(slug, parsed);
  } catch (err) {
    // A 404 is a real state: the directory exists and nobody has written a
    // _meta.yml yet, which IS five empty domains. Anything else — 403, 500, a
    // rate limit, malformed YAML — means the row could not be READ, and
    // reporting that as five empty domains puts a number on a measurement that
    // never happened. The Meters on the coverage dashboard count these rows, so
    // one throttled request used to render "Behavior 0 of 73" with a measured
    // date beside it.
    const status = (err as { status?: number }).status;
    return {
      slug,
      component: slug,
      domains: blankDomains(),
      a11yRefs: [],
      origin: "authored",
      unreadable: status !== 404,
    };
  }
}

function parseRow(slug: string, raw: Record<string, unknown>): CoverageRow {
  const domains = (raw.domains as Record<string, unknown>) ?? {};
  return {
    slug,
    component: typeof raw.component === "string" ? raw.component : slug,
    category: typeof raw.category === "string" ? raw.category : undefined,
    domains: {
      content: normalize(domains.content),
      usage: normalize(domains.usage),
      design: normalize(domains.design),
      behavior: normalize(domains.behavior),
      tokens: normalize(domains.tokens),
    },
    a11yRefs: parseA11yRefs(raw),
    origin: "authored",
  };
}

export function parseA11yRefs(
  raw: Record<string, unknown> | unknown,
): string[] {
  const arr = (raw as { a11y_refs?: unknown })?.a11y_refs;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((e) =>
      e && typeof e === "object" ? (e as { ref?: unknown }).ref : undefined,
    )
    .filter((r): r is string => typeof r === "string");
}

function normalize(entry: unknown): DomainEntry {
  if (!entry || typeof entry !== "object") return { status: "not-started" };
  const e = entry as Record<string, unknown>;
  const status = isStatus(e.status) ? e.status : "not-started";
  return {
    status,
    owner: typeof e.owner === "string" ? e.owner : undefined,
    updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : undefined,
  };
}

function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

function blankDomains(): Record<Domain, DomainEntry> {
  return {
    content: { status: "not-started" },
    usage: { status: "not-started" },
    design: { status: "not-started" },
    behavior: { status: "not-started" },
    tokens: { status: "not-started" },
  };
}

export interface CoverageCounts {
  total: number;
  authored: number;
  unstarted: number;
  perDomain: Record<Domain, { authored: number; inherited: number }>;
}

export function summarize(rows: CoverageRow[]): CoverageCounts {
  const counts: CoverageCounts = {
    total: rows.length,
    authored: 0,
    unstarted: 0,
    perDomain: {
      content: { authored: 0, inherited: 0 },
      usage: { authored: 0, inherited: 0 },
      design: { authored: 0, inherited: 0 },
      behavior: { authored: 0, inherited: 0 },
      tokens: { authored: 0, inherited: 0 },
    },
  };
  for (const row of rows) {
    if (row.origin === "authored") counts.authored += 1;
    else counts.unstarted += 1;
    for (const d of DOMAINS) {
      const s = row.domains[d].status;
      if (s === "approved" || s === "draft") counts.perDomain[d].authored += 1;
      else if (s === "inherited") counts.perDomain[d].inherited += 1;
    }
  }
  return counts;
}

// Resolve the file path a cell click navigates to.
// - approved/draft → the per-component domain file (canonical edit target)
// - inherited → the category-level default file
// - not-started → the _meta.yml (author starts by changing status there)
export function cellTarget(row: CoverageRow, domain: Domain): string {
  const status = row.domains[domain].status;
  if (status === "approved" || status === "draft") {
    return `components/src/${row.slug}/${domainFileName(domain)}`;
  }
  if (status === "inherited" && row.category) {
    return `components/src/categories/${row.category}.md`;
  }
  return `components/src/${row.slug}/_meta.yml`;
}

// Generate a schema-valid stub _meta.yml for a ghost row. All domains
// start at "not-started" — author updates the matrix after merge.
export function buildStubMeta(row: CoverageRow): string {
  const lines: string[] = [];
  lines.push(
    "# yaml-language-server: $schema=../../../schemas/guideline-meta.json",
  );
  lines.push(`component: "${row.component.replace(/"/g, '\\"')}"`);
  if (row.category) {
    lines.push(`category: ${row.category}`);
  }
  lines.push("domains:");
  for (const d of DOMAINS) {
    lines.push(`  ${d}: { status: not-started }`);
  }
  lines.push("");
  return lines.join("\n");
}
