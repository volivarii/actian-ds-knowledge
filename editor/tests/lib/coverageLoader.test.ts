import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStubMeta,
  cellTarget,
  loadCoverage,
  summarize,
  type CoverageRow,
} from "../../src/lib/coverageLoader";

function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

function fakeGh(opts: {
  dirs: Array<{ name: string; type: "dir" | "file" }>;
  files: Record<string, string>;
  registry?: Record<
    string,
    { name: string; category?: string; section?: string }
  >;
  /** slugs whose _meta.yml answers 403 rather than 404 */
  throttle?: string[];
  /** counts every directory listing, to see whether the memo re-crawled */
  onList?: () => void;
}) {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/src") {
          opts.onList?.();
          return { data: opts.dirs };
        }
        if (path === "components/dist/registries/dskit.json") {
          const body = JSON.stringify({ components: opts.registry ?? {} });
          return { data: { content: b64(body), encoding: "base64" } };
        }
        if (
          (opts.throttle ?? []).some((s) => path === `components/src/${s}/_meta.yml`)
        ) {
          const err = new Error("forbidden") as Error & { status: number };
          err.status = 403;
          throw err;
        }
        const content = opts.files[path];
        if (content === undefined) {
          const err = new Error("not found") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return { data: { content: b64(content), encoding: "base64" } };
      },
    },
  } as any;
}

const FIXTURE_DIRS = [
  { name: "button", type: "dir" as const },
  { name: "tabs", type: "dir" as const },
  { name: "categories", type: "dir" as const },
  { name: "guidelines", type: "dir" as const },
  { name: "AUTHORING.md", type: "file" as const },
];

const FIXTURE_FILES = {
  "components/src/button/_meta.yml": `
component: "Button"
category: action
domains:
  content: { status: approved, owner: content-team }
  usage: { status: draft }
  design: { status: inherited }
  behavior: { status: not-started }
  tokens: { status: not-started }
`,
  "components/src/tabs/_meta.yml": `
component: "Tabs"
category: navigation
domains:
  content: { status: approved }
  usage: { status: not-started }
  design: { status: inherited }
  behavior: { status: inherited }
  tokens: { status: not-started }
`,
};

test("loadCoverage: returns one row per non-skipped component dir", async () => {
  const gh = fakeGh({ dirs: FIXTURE_DIRS, files: FIXTURE_FILES });
  const { rows } = await loadCoverage(gh);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.slug),
    ["button", "tabs"],
  );
});

test("loadCoverage: parses domain statuses from YAML", async () => {
  const gh = fakeGh({ dirs: FIXTURE_DIRS, files: FIXTURE_FILES });
  const { rows } = await loadCoverage(gh);
  const button = rows.find((r) => r.slug === "button")!;
  assert.equal(button.component, "Button");
  assert.equal(button.category, "action");
  assert.equal(button.domains.content.status, "approved");
  assert.equal(button.domains.content.owner, "content-team");
  assert.equal(button.domains.usage.status, "draft");
  assert.equal(button.domains.design.status, "inherited");
  assert.equal(button.domains.behavior.status, "not-started");
});

test("loadCoverage: missing _meta.yml falls back to all-not-started", async () => {
  const gh = fakeGh({
    dirs: [{ name: "orphan", type: "dir" }],
    files: {},
  });
  const { rows } = await loadCoverage(gh);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.slug, "orphan");
  assert.equal(rows[0]!.component, "orphan");
  assert.equal(rows[0]!.domains.content.status, "not-started");
});

test("loadCoverage: skips categories/ and guidelines/", async () => {
  const gh = fakeGh({ dirs: FIXTURE_DIRS, files: FIXTURE_FILES });
  const { rows } = await loadCoverage(gh);
  assert.ok(!rows.some((r) => r.slug === "categories"));
  assert.ok(!rows.some((r) => r.slug === "guidelines"));
});

test("summarize: counts authored (draft+approved) and inherited per domain", async () => {
  const gh = fakeGh({ dirs: FIXTURE_DIRS, files: FIXTURE_FILES });
  const { rows } = await loadCoverage(gh);
  const counts = summarize(rows);
  assert.equal(counts.total, 2);
  // both buttons + tabs have content=approved → 2 authored
  assert.equal(counts.perDomain.content.authored, 2);
  // button.usage=draft, tabs.usage=not-started → 1 authored
  assert.equal(counts.perDomain.usage.authored, 1);
  // both have design=inherited → 0 authored, 2 inherited
  assert.equal(counts.perDomain.design.authored, 0);
  assert.equal(counts.perDomain.design.inherited, 2);
  // button.behavior=not-started, tabs.behavior=inherited
  assert.equal(counts.perDomain.behavior.authored, 0);
  assert.equal(counts.perDomain.behavior.inherited, 1);
});

test("cellTarget: approved/draft → per-component domain file", () => {
  const row: CoverageRow = {
    slug: "button",
    component: "Button",
    category: "action",
    domains: {
      content: { status: "approved" },
      usage: { status: "draft" },
      design: { status: "inherited" },
      behavior: { status: "not-started" },
      tokens: { status: "not-started" },
    },
    a11yRefs: [],
    origin: "authored",
  };
  assert.equal(cellTarget(row, "content"), "components/src/button/content.md");
  assert.equal(cellTarget(row, "usage"), "components/src/button/usage.md");
});

test("cellTarget: inherited → category-level file", () => {
  const row: CoverageRow = {
    slug: "button",
    component: "Button",
    category: "action",
    domains: {
      content: { status: "approved" },
      usage: { status: "draft" },
      design: { status: "inherited" },
      behavior: { status: "not-started" },
      tokens: { status: "not-started" },
    },
    a11yRefs: [],
    origin: "authored",
  };
  assert.equal(
    cellTarget(row, "design"),
    "components/src/categories/action.md",
  );
});

test("cellTarget: not-started → _meta.yml (so author can change status)", () => {
  const row: CoverageRow = {
    slug: "button",
    component: "Button",
    domains: {
      content: { status: "not-started" },
      usage: { status: "not-started" },
      design: { status: "not-started" },
      behavior: { status: "not-started" },
      tokens: { status: "not-started" },
    },
    a11yRefs: [],
    origin: "authored",
  };
  assert.equal(cellTarget(row, "content"), "components/src/button/_meta.yml");
});

test("cellTarget: inherited but missing category falls back to _meta.yml", () => {
  const row: CoverageRow = {
    slug: "orphan",
    component: "orphan",
    domains: {
      content: { status: "inherited" },
      usage: { status: "not-started" },
      design: { status: "not-started" },
      behavior: { status: "not-started" },
      tokens: { status: "not-started" },
    },
    a11yRefs: [],
    origin: "authored",
  };
  assert.equal(cellTarget(row, "content"), "components/src/orphan/_meta.yml");
});

test("loadCoverage: merges authored + unstarted from registry, marks origins", async () => {
  const gh = fakeGh({
    dirs: FIXTURE_DIRS,
    files: FIXTURE_FILES,
    registry: {
      // overlaps with authored
      button: { name: "Button", category: "Action", section: "Components" },
      // new ghosts
      "data-grid": {
        name: "Data grid",
        category: "Data Display",
        section: "Components",
      },
      tooltip: { name: "Tooltip", category: "Overlays", section: "Components" },
      // excluded by SECTION: an icon is Foundations, a logo is Brand Assets.
      // Both used to be excluded by naming their category in a hand-kept list,
      // which is what let a category the list did not name through.
      "icon-arrow-up": {
        name: "Arrow up",
        category: "Icons",
        section: "Foundations",
      },
      snowflake: {
        name: "Snowflake",
        category: "Third-party logos",
        section: "Brand Assets",
      },
    },
  });
  const { rows } = await loadCoverage(gh);
  const slugs = rows.map((r) => r.slug);
  assert.ok(slugs.includes("button"));
  assert.ok(slugs.includes("tabs"));
  assert.ok(slugs.includes("data-grid"));
  assert.ok(slugs.includes("tooltip"));
  // Icon excluded.
  assert.equal(slugs.includes("icon-arrow-up"), false);
  // Authored origin preserved for _meta.yml dirs.
  assert.equal(rows.find((r) => r.slug === "button")!.origin, "authored");
  assert.equal(rows.find((r) => r.slug === "tabs")!.origin, "authored");
  // Ghost origin for registry-only.
  assert.equal(rows.find((r) => r.slug === "data-grid")!.origin, "unstarted");
  assert.equal(rows.find((r) => r.slug === "tooltip")!.origin, "unstarted");
  // Component name from registry, category slugified.
  const dg = rows.find((r) => r.slug === "data-grid")!;
  assert.equal(dg.component, "Data grid");
  assert.equal(dg.category, "data-display");
});

test("loadCoverage: a registry that cannot be read REJECTS, naming the registry", async () => {
  // This used to resolve with the authored rows alone and call it graceful.
  // The registry is the eligible set, the denominator of every Component
  // Meter, so that grace rendered "Capture 45 of 54" with a measured date on a
  // 403 that should have said nothing, and the memo pinned it for five minutes.
  const gh = {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        if (path === "components/src") return { data: FIXTURE_DIRS };
        if (path === "components/dist/registries/dskit.json") {
          throw new Error("registry fetch failed");
        }
        const c = (FIXTURE_FILES as Record<string, string>)[path];
        if (c === undefined) throw new Error("not found");
        return { data: { content: b64(c), encoding: "base64" } };
      },
    },
  } as any;
  await assert.rejects(
    loadCoverage(gh),
    (err: Error) =>
      /dskit\.json/.test(err.message) && /registry fetch failed/.test(err.message),
  );
});

test("loadCoverage: an unreadable _meta.yml leaves the rows and is named", async () => {
  const gh = fakeGh({ dirs: FIXTURE_DIRS, files: FIXTURE_FILES, throttle: ["tabs"] });
  const { rows, unreadable } = await loadCoverage(gh);
  // Out of `rows` entirely, so no consumer can count it as five empty domains,
  // and named so a screen can say which file to look at.
  assert.deepEqual(unreadable, ["tabs"]);
  assert.deepEqual(rows.map((r) => r.slug), ["button"]);
});

test("loadCoverage: an empty _meta.yml is five empty domains, not an unreadable row", async () => {
  // A file somebody created and wrote nothing into parses to null. That is the
  // same fact as a 404 (nothing written yet), and it used to throw inside
  // parseRow and be reported as "could not be read" for a file that read fine.
  const gh = fakeGh({
    dirs: FIXTURE_DIRS,
    files: { ...FIXTURE_FILES, "components/src/tabs/_meta.yml": "# nothing yet\n" },
  });
  const { rows, unreadable } = await loadCoverage(gh);
  assert.deepEqual(unreadable, []);
  const tabs = rows.find((r) => r.slug === "tabs");
  assert.ok(tabs);
  assert.ok(
    Object.values(tabs.domains).every((d) => d.status === "not-started"),
    "an empty file should read as five not-started domains",
  );
});

test("loadCoverage: a degraded crawl is not pinned for the TTL", async () => {
  // The memo evicted only an EMPTY result. A crawl with one unreadable row is
  // the same event caught one file at a time, and pinning it served the
  // "could not be read" note, and the smaller denominators behind it, for
  // five minutes with no invalidation hook.
  let listings = 0;
  const degraded = fakeGh({
    dirs: FIXTURE_DIRS,
    files: FIXTURE_FILES,
    throttle: ["tabs"],
    onList: () => (listings += 1),
  });
  await loadCoverage(degraded);
  await loadCoverage(degraded);
  assert.equal(listings, 2, "a degraded crawl was served from the memo");
  // Positive control: a clean crawl IS memoized, so the assertion above is
  // about the eviction and not about the memo being absent.
  listings = 0;
  const clean = fakeGh({
    dirs: FIXTURE_DIRS,
    files: FIXTURE_FILES,
    onList: () => (listings += 1),
  });
  await loadCoverage(clean);
  await loadCoverage(clean);
  assert.equal(listings, 1, "a clean crawl should be served from the memo");
});

test("summarize: counts authored vs unstarted rows separately", async () => {
  const gh = fakeGh({
    dirs: FIXTURE_DIRS,
    files: FIXTURE_FILES,
    registry: {
      "data-grid": {
        name: "Data grid",
        category: "Data Display",
        section: "Components",
      },
      tooltip: { name: "Tooltip", category: "Overlays", section: "Components" },
    },
  });
  const { rows } = await loadCoverage(gh);
  const c = summarize(rows);
  assert.equal(c.total, 4);
  assert.equal(c.authored, 2);
  assert.equal(c.unstarted, 2);
});

test("buildStubMeta: produces schema-aligned YAML with all 5 domains not-started", () => {
  const row: CoverageRow = {
    slug: "data-grid",
    component: "Data grid",
    category: "data-display",
    domains: {
      content: { status: "not-started" },
      usage: { status: "not-started" },
      design: { status: "not-started" },
      behavior: { status: "not-started" },
      tokens: { status: "not-started" },
    },
    a11yRefs: [],
    origin: "unstarted",
    registryKey: "data-grid",
  };
  const yaml = buildStubMeta(row);
  assert.match(
    yaml,
    /\$schema=\.\.\/\.\.\/\.\.\/schemas\/guideline-meta\.json/,
  );
  assert.match(yaml, /component: "Data grid"/);
  assert.match(yaml, /category: data-display/);
  for (const d of ["content", "usage", "design", "behavior", "tokens"]) {
    assert.match(yaml, new RegExp(`${d}: \\{ status: not-started \\}`));
  }
});

test("buildStubMeta: omits category when not present", () => {
  const row: CoverageRow = {
    slug: "x",
    component: "X",
    domains: {
      content: { status: "not-started" },
      usage: { status: "not-started" },
      design: { status: "not-started" },
      behavior: { status: "not-started" },
      tokens: { status: "not-started" },
    },
    a11yRefs: [],
    origin: "unstarted",
    registryKey: "x",
  };
  const yaml = buildStubMeta(row);
  assert.equal(yaml.includes("category:"), false);
});
